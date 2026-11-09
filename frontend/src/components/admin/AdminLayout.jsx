import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import AdminHeader from './AdminHeader.jsx';
import styles from './AdminLayout.module.css';

const SECTION_TITLES = {
  '/admin': 'Dashboard Overview',
  '/admin/giveaways': 'Giveaway Operations',
  '/admin/claims': 'Prize Claims Queue',
  '/admin/ledger': 'Financial Ledger & Participations',
  '/admin/fraud': 'Fraud & Risk Queue',
  '/admin/audit-logs': 'Audit Log Trail',
  '/admin/users': 'User Account Directory',
};

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Pick title based on matching pathname prefix
  const currentTitle =
    Object.entries(SECTION_TITLES).find(([path]) =>
      path === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(path),
    )?.[1] || 'Administration';

  return (
    <div className={styles.layout}>
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={styles.main}>
        <AdminHeader
          title={currentTitle}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
