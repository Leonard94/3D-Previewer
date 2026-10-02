import type { Document, Material, Property, Texture } from '@gltf-transform/core';
import sharp from 'sharp';
import { isPowerOfTwo } from '../../shared/format.ts';
import type { MaterialInfo, TextureInfo, TextureSlot } from '../../shared/types.ts';

/** Множитель на мипмапы. */
const MIPS = 4 / 3;
/** Байт на пиксель в Godot (VRAM Compressed, десктоп). */
const GODOT_BPP = { BC5: 1, 'BC3/BC7': 1, BC1: 0.5 } as const;

const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Альфа: есть ли канал и реально ли он используется (не всё непрозрачно). */
async function alphaUsage(texture: Texture): Promise<TextureInfo['alpha']> {
  const mime = texture.getMimeType();
  const image = texture.getImage();
  if (!image) return null;
  if (mime === 'image/jpeg') return 'none';
  if (!PREVIEWABLE.has(mime)) return null; // KTX2 и прочее sharp не декодирует
  try {
    const img = sharp(image);
    const meta = await img.metadata();
    if (!meta.hasAlpha) return 'none';
    const stats = await img.stats();
    return stats.isOpaque ? 'unused' : 'used';
  } catch {
    return null;
  }
}

/** Слоты, в которых текстура используется материалом. */
function materialSlots(material: Material, texture: Texture): TextureSlot[] {
  const slots: TextureSlot[] = [];
  if (material.getBaseColorTexture() === texture) slots.push('baseColor');
  if (material.getNormalTexture() === texture) slots.push('normal');
  const mr = material.getMetallicRoughnessTexture() === texture;
  const occ = material.getOcclusionTexture() === texture;
  if (mr && occ) slots.push('orm');
  else if (mr) slots.push('metallicRoughness');
  else if (occ) slots.push('occlusion');
  if (material.getEmissiveTexture() === texture) slots.push('emissive');
  return slots;
}

/** Материал, к которому относится свойство (сам материал или его расширение). */
function owningMaterial(prop: Property, materials: Set<Material>): Material | null {
  if (materials.has(prop as Material)) return prop as Material;
  for (const parent of prop.listParents()) if (materials.has(parent as Material)) return parent as Material;
  return null;
}

export interface TexturesResult {
  textures: TextureInfo[];
  materials: MaterialInfo[];
}

export async function analyzeTextures(
  doc: Document,
  usedMaterials: Set<Material>,
  materialObjects: Map<Material, number>,
  previewable: boolean[],
): Promise<TexturesResult> {
  const root = doc.getRoot();
  const allMaterials = root.listMaterials();
  const materialSet = new Set(allMaterials);
  const textureList = root.listTextures();
  const textureIndex = new Map(textureList.map((t, i) => [t, i]));

  // Текстура → материалы и слоты (включая слоты расширений → «Другое»).
  const usage = new Map<Texture, { materials: Set<Material>; slots: Set<TextureSlot> }>();
  for (const texture of textureList) {
    const u = { materials: new Set<Material>(), slots: new Set<TextureSlot>() };
    for (const parent of texture.listParents()) {
      const material = owningMaterial(parent, materialSet);
      if (!material) continue;
      u.materials.add(material);
      if (parent === material) for (const s of materialSlots(material, texture)) u.slots.add(s);
      else u.slots.add('other');
    }
    usage.set(texture, u);
  }

  const textures: TextureInfo[] = [];
  for (const [index, texture] of textureList.entries()) {
    const size = texture.getSize() ?? [0, 0];
    const [width, height] = size;
    const mimeType = texture.getMimeType();
    const u = usage.get(texture)!;
    const slots = [...u.slots];
    const alpha = await alphaUsage(texture);
    const compressed = mimeType === 'image/ktx2';
    const godotFormat: TextureInfo['godotFormat'] = compressed
      ? null
      : slots.includes('normal')
        ? 'BC5'
        : alpha === 'used'
          ? 'BC3/BC7'
          : 'BC1';
    const uri = texture.getURI();
    textures.push({
      index,
      name: texture.getName() || (uri ? uri.split('/').pop()! : '') || `image_${index}`,
      slots,
      width,
      height,
      pot: isPowerOfTwo(width) && isPowerOfTwo(height),
      mimeType,
      fileBytes: texture.getImage()?.byteLength ?? 0,
      alpha,
      vramUncompressed: Math.round(width * height * 4 * MIPS),
      vramGodot: godotFormat ? Math.round(width * height * GODOT_BPP[godotFormat] * MIPS) : null,
      godotFormat,
      materialCount: u.materials.size,
      hasPreview: PREVIEWABLE.has(mimeType) && previewable[index] === true,
    });
  }

  const materials: MaterialInfo[] = allMaterials.map((m, index) => {
    const tex = new Set<number>();
    for (const [texture, u] of usage) if (u.materials.has(m)) tex.add(textureIndex.get(texture)!);
    return {
      index,
      name: m.getName() || `material_${index}`,
      alphaMode: m.getAlphaMode(),
      doubleSided: m.getDoubleSided(),
      unlit: m.getExtension('KHR_materials_unlit') !== null,
      textures: [...tex].sort((a, b) => a - b),
      objectCount: materialObjects.get(m) ?? 0,
      used: usedMaterials.has(m),
    };
  });

  return { textures, materials };
}
