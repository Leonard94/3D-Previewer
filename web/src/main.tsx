import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';
import { HintLayer } from './components/HintLayer.tsx';
import { CatalogPage } from './pages/Catalog/CatalogPage.tsx';
import { NewSceneRedirect, SceneRoute } from './pages/Scene/SceneRoute.tsx';
import { SettingsPage } from './pages/Settings/SettingsPage.tsx';
import { ViewerPage } from './pages/Viewer/ViewerPage.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/view" element={<ViewerPage />} />
        <Route path="/scene" element={<NewSceneRedirect />} />
        <Route path="/scene/:id" element={<SceneRoute />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
      <HintLayer />
    </BrowserRouter>
  </StrictMode>,
);
