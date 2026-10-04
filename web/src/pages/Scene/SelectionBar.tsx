import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Vec3 } from '../../../../shared/types.ts';
import { useCatalog } from '../../store/catalog.ts';
import { useScene, type GizmoMode } from '../../store/scene.ts';
import { AXIS_COLORS, fromBlender, toBlender } from '../../three/blenderAxes.ts';
import { CrossIcon, DropIcon, DuplicateIcon, MoveIcon, RotateIcon } from './icons.tsx';

const MODES: { mode: GizmoMode; label: string; key: string; icon: ReactNode }[] = [
  { mode: 'translate', label: 'Перемещать', key: 'G', icon: <MoveIcon /> },
  { mode: 'rotate', label: 'Поворачивать', key: 'R', icon: <RotateIcon /> },
];

const AXES = ['X', 'Y', 'Z'] as const;
const RAD = Math.PI / 180;

/**
 * Инструменты выделенной модели — в углу вьюпорта: гизмо, действия и координаты.
 * Координаты — в осях Blender (Z вверх), в метрах; поворот — вокруг вертикали, в градусах.
 */
export function SelectionBar() {
  const item = useScene((s) => s.items.find((i) => i.uid === s.selected));
  const gizmo = useScene((s) => s.gizmo);
  const live = useScene((s) => (s.live && s.live.uid === s.selected ? s.live : null));
  const title = useCatalog((s) => (item ? s.models[item.modelId]?.title : undefined));
  if (!item?.position) return null;
  const s = useScene.getState;
  const stored = item.position;

  // Пока модель тянут гизмо — живые значения, иначе — из стора.
  const position = toBlender(live?.position ?? stored);
  const rotation = normalizeDegrees((live?.rotationY ?? item.rotationY) / RAD);
  const setAxis = (axis: number, value: number) => {
    const next = [...position] as Vec3;
    next[axis] = value;
    s().setTransform(item.uid, fromBlender(next), item.rotationY);
  };

  return (
    <div className="scene-sel">
      <div className="scene-sel__row">
        <span className="scene-sel__name" title={item.modelId}>
          {title ?? item.modelId}
        </span>
        <div className="shading__group" role="radiogroup" aria-label="Гизмо">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={gizmo === m.mode}
              aria-label={m.label}
              className={`shading__btn${gizmo === m.mode ? ' active' : ''}`}
              onClick={() => s().setGizmo(m.mode)}
              data-hint={`${m.label} — клавиша ${m.key}\nShift — без привязки к шагу`}
            >
              {m.icon}
            </button>
          ))}
        </div>
        <div className="shading__group">
          <button
            type="button"
            className="shading__btn"
            aria-label="Опустить на поверхность"
            onClick={() => s().dropToSurface(item.uid)}
            data-hint="Опустить на поверхность — на то, что под моделью (асфальт, стол), или на пол"
          >
            <DropIcon />
          </button>
          <button type="button" className="shading__btn" aria-label="Дубль" onClick={() => s().duplicate(item.uid)} data-hint="Дубль — Shift+D">
            <DuplicateIcon />
          </button>
          <button type="button" className="shading__btn" aria-label="Убрать из сцены" onClick={() => s().remove(item.uid)} data-hint="Убрать из сцены — X">
            <CrossIcon />
          </button>
        </div>
      </div>
      <div className="scene-sel__row scene-sel__fields" data-hint="Оси как в Blender: Z — вверх. Enter — применить, ↑↓ — шаг (с Shift — мельче)">
        {AXES.map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            color={AXIS_COLORS[i]}
            unit="м"
            value={position[i]!}
            digits={3}
            step={0.1}
            fineStep={0.01}
            onCommit={(v) => setAxis(i, v)}
          />
        ))}
        <NumberField
          label="↻"
          unit="°"
          value={rotation}
          digits={1}
          step={15}
          fineStep={1}
          onCommit={(deg) => s().setTransform(item.uid, stored, normalizeDegrees(deg) * RAD)}
        />
      </div>
    </div>
  );
}

/** Угол в (−180°, 180°]. */
function normalizeDegrees(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Число без хвостовых нулей и без «−0». */
function format(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Поле числа: ввод применяется по Enter или при уходе из поля, Esc — отмена. ↑↓ меняют на шаг,
 * с Shift — на мелкий шаг. Принимает и запятую.
 */
function NumberField({
  label,
  color,
  unit,
  value,
  digits,
  step,
  fineStep,
  onCommit,
}: {
  label: string;
  color?: string;
  unit: string;
  value: number;
  digits: number;
  step: number;
  fineStep: number;
  onCommit: (value: number) => void;
}) {
  // draft — текст, пока поле в фокусе; иначе показывается текущее значение. Ref — чтобы blur сразу
  // после Enter или Esc видел уже сброшенный черновик, а не значение из прошлой отрисовки.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (d: string | null) => {
    draftRef.current = d;
    setDraftState(d);
  };

  const commit = () => {
    const text = draftRef.current;
    if (text === null) return;
    setDraft(null);
    const v = Number(text.replace(',', '.').trim());
    if (text.trim() !== '' && Number.isFinite(v) && format(v, digits) !== format(value, digits)) onCommit(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(null);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = Number((draftRef.current ?? String(value)).replace(',', '.'));
      const base = Number.isFinite(current) ? current : value;
      const next = base + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? fineStep : step);
      setDraft(format(next, digits));
      onCommit(Number(format(next, digits)));
    }
  };

  return (
    <label className="num-field">
      <span className="num-field__label" style={color ? { color } : undefined}>
        {label}
      </span>
      <input
        className="num-field__input num"
        type="text"
        inputMode="decimal"
        value={draft ?? format(value, digits)}
        onFocus={(e) => {
          setDraft(format(value, digits));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <span className="num-field__unit muted">{unit}</span>
    </label>
  );
}
