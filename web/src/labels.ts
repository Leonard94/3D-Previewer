import type { Presence, TextureInfo, TextureSlot, VertexAttribute } from '../../shared/types.ts';

export const SLOT_LABELS: Record<TextureSlot, string> = {
  baseColor: 'Base Color',
  normal: 'Normal',
  metallicRoughness: 'Metallic-Roughness',
  occlusion: 'Occlusion',
  orm: 'ORM',
  emissive: 'Emission',
  other: 'Другое',
};

export const ALPHA_LABELS: Record<NonNullable<TextureInfo['alpha']>, string> = {
  used: 'используется',
  unused: 'канал есть, не нужен',
  none: 'нет',
};

export const MIME_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/ktx2': 'KTX2',
};

export const formatLabel = (mime: string) => MIME_LABELS[mime] ?? (mime || '?');

export const ATTRIBUTE_LABELS: Record<VertexAttribute, string> = {
  NORMAL: 'Нормали',
  TANGENT: 'Касательные',
  TEXCOORD_0: 'UV',
  TEXCOORD_1: 'UV2',
  COLOR_0: 'Цвет вершин',
  JOINTS_0: 'Кости',
  WEIGHTS_0: 'Веса',
};

export const ATTRIBUTE_HINTS: Partial<Record<VertexAttribute, string>> = {
  TEXCOORD_1: 'Второй UV-канал нужен для запекания света LightmapGI в Godot',
  TANGENT: 'Godot умеет считать касательные сам при импорте',
};

export const PRESENCE_LABELS: Record<Presence, string> = {
  all: 'есть',
  some: 'частично',
  none: 'нет',
};
