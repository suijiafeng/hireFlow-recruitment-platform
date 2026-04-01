import { createBrowserRouter, Navigate } from 'react-router';
import { MainLayout } from './layouts/MainLayout';
import { CandidatesPage } from './pages/candidates/CandidatesPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { InterviewsPage } from './pages/interviews/InterviewsPage';
import { JobsPage } from './pages/jobs/JobsPage';
import { LoginPage } from './pages/Login';
import { OffersPage } from './pages/offers/OffersPage';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { PipelinePage } from './pages/pipeline/PipelinePage';
import { SettingsPage } from './pages/settings/SettingsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'candidates', element: <CandidatesPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'interviews', element: <InterviewsPage /> },
      { path: 'offers', element: <OffersPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
