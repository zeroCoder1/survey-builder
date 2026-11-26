import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { LOCAL_MODE } from './api';
import Home from './pages/Home';
import StudyPage from './pages/StudyPage';
import TakeSurvey from './pages/TakeSurvey';
import './styles.css';

// Static hosting (GitHub Pages) has no server-side fallback, so the local build uses hash routes.
const Router = LOCAL_MODE ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/study/:id" element={<StudyPage />} />
        <Route path="/take/:studyId/:surveyId" element={<TakeSurvey />} />
      </Routes>
    </Router>
  </React.StrictMode>,
);
