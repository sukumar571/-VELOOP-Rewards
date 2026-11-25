import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import GiveawaysPage from './pages/GiveawaysPage.jsx';
import GiveawayDetailPage from './pages/GiveawayDetailPage.jsx';
import WinnersPage from './pages/WinnersPage.jsx';
import WalletPage from './pages/rewards/WalletPage.jsx';
import EarnRewardsPage from './pages/rewards/EarnRewardsPage.jsx';
import ReferralPage from './pages/rewards/ReferralPage.jsx';
import RedeemCodePage from './pages/rewards/RedeemCodePage.jsx';
import TransactionsPage from './pages/rewards/TransactionsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import LegalPage from './pages/LegalPage.jsx';
import AccountPage from './pages/AccountPage.jsx';

import { ToastProvider } from './context/ToastContext.jsx';
import AdminRoute from './components/admin/AdminRoute.jsx';
import AdminLayout from './components/admin/AdminLayout.jsx';
import AdminOverviewPage from './pages/admin/AdminOverviewPage.jsx';
import AdminGiveawaysPage from './pages/admin/AdminGiveawaysPage.jsx';
import AdminGiveawayDetailPage from './pages/admin/AdminGiveawayDetailPage.jsx';
import AdminPrizesPage from './pages/admin/AdminPrizesPage.jsx';
import AdminParticipantsPage from './pages/admin/AdminParticipantsPage.jsx';
import AdminWinnersPage from './pages/admin/AdminWinnersPage.jsx';
import AdminClaimsPage from './pages/admin/AdminClaimsPage.jsx';
import AdminLedgerPage from './pages/admin/AdminLedgerPage.jsx';
import AdminFraudPage from './pages/admin/AdminFraudPage.jsx';
import AdminAuditPage from './pages/admin/AdminAuditPage.jsx';
import AdminReportsPage from './pages/admin/AdminReportsPage.jsx';
import AdminSettingsPage from './pages/admin/AdminSettingsPage.jsx';
import AdminUsersPage from './pages/admin/AdminUsersPage.jsx';
import AdminRewardActivitiesPage from './pages/admin/AdminRewardActivitiesPage.jsx';
import AdminRewardCodesPage from './pages/admin/AdminRewardCodesPage.jsx';
import AdminRewardReferralsPage from './pages/admin/AdminRewardReferralsPage.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="giveaways" element={<GiveawaysPage />} />
          <Route path="giveaways/:slug" element={<GiveawayDetailPage />} />
          <Route path="winners" element={<WinnersPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="earn" element={<EarnRewardsPage />} />
          <Route path="refer" element={<ReferralPage />} />
          <Route path="redeem" element={<RedeemCodePage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="legal" element={<LegalPage />} />
        </Route>

        {/* Protected SaaS Admin Suite */}
        <Route
          path="admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          {/* 1. Dashboard Overview */}
          <Route index element={<AdminOverviewPage />} />

          {/* 2. Giveaway Management */}
          <Route path="giveaways" element={<AdminGiveawaysPage />} />
          <Route path="giveaways/:id" element={<AdminGiveawayDetailPage />} />

          {/* 3. Prize Management */}
          <Route path="prizes" element={<AdminPrizesPage />} />

          {/* 4. Participants */}
          <Route path="participants" element={<AdminParticipantsPage />} />

          {/* 5. Winner Management */}
          <Route path="winners" element={<AdminWinnersPage />} />

          {/* 6. Prize Claims */}
          <Route path="claims" element={<AdminClaimsPage />} />

          {/* 7. Transactions */}
          <Route path="transactions" element={<AdminLedgerPage />} />
          <Route path="ledger" element={<AdminLedgerPage />} />

          {/* 8. Fraud Monitoring */}
          <Route path="fraud" element={<AdminFraudPage />} />

          {/* 9. Audit Logs */}
          <Route path="audit-logs" element={<AdminAuditPage />} />

          {/* 10. Reports and Analytics */}
          <Route path="reports" element={<AdminReportsPage />} />

          {/* 11. Admin Settings */}
          <Route path="settings" element={<AdminSettingsPage />} />

          {/* 12. Reward programme management */}
          <Route path="reward-activities" element={<AdminRewardActivitiesPage />} />
          <Route path="reward-codes" element={<AdminRewardCodesPage />} />
          <Route path="referrals" element={<AdminRewardReferralsPage />} />

          {/* Staff directory */}
          <Route path="users" element={<AdminUsersPage />} />
        </Route>

        <Route element={<Layout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
