import { useLayoutEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { newSceneId, startAutosave } from '../../store/sceneLibrary.ts';
import { ScenePage } from './ScenePage.tsx';

/** /scene/:id — сцена открывается в сторе до первого рендера: канвас сразу видит её модели и ракурс. */
export function SceneRoute() {
  const { id = '' } = useParams();
  const [openId, setOpenId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const stop = startAutosave(id);
    setOpenId(id);
    return stop;
  }, [id]);
  // Другая сцена — страница собирается заново, со своим канвасом.
  return openId === id ? <ScenePage key={id} /> : null;
}

/** /scene без id — новая сцена. В хранилище она появится, когда в ней будет модель. */
export function NewSceneRedirect() {
  const [id] = useState(newSceneId);
  return <Navigate to={`/scene/${id}`} replace />;
}
