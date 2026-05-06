import { createBrowserRouter, Navigate } from 'react-router';
import { firstVisiblePath, MainLayout } from './layouts/MainLayout';
import { useAuthStore } from './stores/auth';
import { CandidatesPage } from './pages/candidates/CandidatesPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { InsightsPage } from './pages/insights/InsightsPage';
import { HelpdeskPage } from './pages/helpdesk/HelpdeskPage';
import { InterviewsPage } from './pages/interviews/InterviewsPage';
import { JobsPage } from './pages/jobs/JobsPage';
import { LoginPage } from './pages/Login';
import { OffersPage } from './pages/offers/OffersPage';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { PipelinePage } from './pages/pipeline/PipelinePage';
import { InterviewPortalPage } from './pages/portal/InterviewPortalPage';
import { OfferPortalPage } from './pages/portal/OfferPortalPage';
import { OnboardingPortalPage } from './pages/portal/OnboardingPortalPage';
import { PrescreenPortalPage } from './pages/portal/PrescreenPortalPage';
import { SettingsPage } from './pages/settings/SettingsPage';

/** 首页按权限落到第一个可见菜单（面试官/IT 无数据大盘权限，不能硬跳 /dashboard） */
function HomeRedirect() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  return <Navigate to={firstVisiblePath(hasPermission)} replace />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // 候选人/新员工免登录门户（链接即凭证，不走 MainLayout 鉴权）
  { path: '/portal/offer/:token', element: <OfferPortalPage /> },
  { path: '/portal/onboarding/:token', element: <OnboardingPortalPage /> },
  { path: '/portal/interview/:token', element: <InterviewPortalPage /> },
  { path: '/portal/prescreen/:token', element: <PrescreenPortalPage /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'candidates', element: <CandidatesPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'interviews', element: <InterviewsPage /> },
      { path: 'offers', element: <OffersPage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      { path: 'helpdesk', element: <HelpdeskPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
