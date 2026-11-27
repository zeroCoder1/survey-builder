import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { LOCAL_MODE } from './api';
import { AuthProvider, RequireAuth } from './auth';
import AccountPage from './pages/AccountPage';
import Home from './pages/Home';
import Login from './pages/Login';
import StudyPage from './pages/StudyPage';
import { LocalSurvey, PublicSurvey } from './pages/TakeSurvey';
import './styles.css';

// Static hosting (GitHub Pages) has no server-side fallback, so the local build uses hash routes.
const Router = LOCAL_MODE ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/study/:id" element={<RequireAuth><StudyPage /></RequireAuth>} />
          {LOCAL_MODE ? (
            <Route path="/take/:studyId/:surveyId" element={<LocalSurvey />} />
          ) : (
            <>
              <Route path="/f/:token" element={<PublicSurvey />} />
              <Route path="/login" element={<Login />} />
              <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
            </>
          )}
        </Routes>
      </AuthProvider>
    </Router>
  </React.StrictMode>,
);
