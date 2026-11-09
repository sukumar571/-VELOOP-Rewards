import { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  CreditCard,
  CheckCircle2,
  TrendingUp,
  Percent,
  Layers,
  Sparkles,
} from 'lucide-react';
import { fetchStats, fetchLedger, fetchGiveaways } from '../../services/adminService.js';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './AdminReportsPage.module.css';

export default function AdminReportsPage() {
  const { showSuccess, showError } = useToast();
  const [stats, setStats] = useState(null);
  const [giveaways, setGiveaways] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadReportData() {
      try {
        setLoading(true);
        const [statsData, gRes, lRes] = await Promise.all([
          fetchStats(),
          fetchGiveaways({ limit: 20, sort: 'participationCount', order: 'desc' }),
          fetchLedger({ limit: 100 }),
        ]);
        if (!alive) return;
        setStats(statsData);
        setGiveaways(gRes.items || []);
        setLedgerEntries(lRes.items || []);
      } catch (err) {
        if (alive) showError(err.message || 'Failed to compile reports data.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadReportData();
    return () => { alive = false; };
  }, [showError]);

  // Aggregate Currency volumes from real ledger
  const currencyTotals = ledgerEntries.reduce((acc, row) => {
    const cur = row.currency || 'VE';
    const amt = Number(row.amount) || 0;
    acc[cur] = (acc[cur] || 0) + amt;
    return acc;
  }, {});

  const totalVolume = Object.values(currencyTotals).reduce((sum, v) => sum + v, 0) || 1;

  // Claims completion percentage
  const totalClaimsCount = (stats?.pendingClaims ?? 0) + (stats?.completedClaims ?? 0);
  const claimCompletionRate = totalClaimsCount > 0
    ? Math.round(((stats?.completedClaims ?? 0) / totalClaimsCount) * 100)
    : 100;

  // Handle CSV export of ledger entries
  const handleExportCSV = () => {
    try {
      setExporting(true);
      if (ledgerEntries.length === 0) {
        showError('No transaction ledger data to export.');
        return;
      }
      const headers = ['Transaction ID', 'User ID', 'Giveaway ID', 'Prize ID', 'Amount', 'Currency', 'Status', 'Date'];
      const rows = ledgerEntries.map((row) => [
        row._id || '',
        row.userId || '',
        row.giveawayId || '',
        row.prizeId || '',
        row.amount || 0,
        row.currency || '',
        row.status || '',
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
      ]);

      const csvContent =
        'data:text/csv;charset=utf-8,' +
        [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `veloop_transactions_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showSuccess('Transaction ledger CSV exported successfully.');
    } catch (err) {
      showError('Failed to generate CSV export.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <p>Generating reports & analytics metrics...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <div className={styles.titleArea}>
          <h1 className={styles.pageTitle}>Reports & Analytics</h1>
          <p className={styles.pageSubtitle}>
            Financial settlement volumes, currency breakdown, participation velocity, and prize claim fulfillment metrics.
          </p>
        </div>
        <button
          type="button"
          className="vl-btn vl-btn-primary"
          onClick={handleExportCSV}
          disabled={exporting || ledgerEntries.length === 0}
        >
          <Download size={16} />
          <span>{exporting ? 'Exporting...' : 'Export Ledger CSV'}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} vl-card`}>
          <span className={styles.kpiLabel}>Settled Transactions</span>
          <div className={styles.kpiValue}>{stats?.settledTransactions ?? 0}</div>
          <span className={styles.kpiSub}>Across all payment gateways</span>
        </div>

        <div className={`${styles.kpiCard} vl-card`}>
          <span className={styles.kpiLabel}>Total Entrants</span>
          <div className={styles.kpiValue}>{stats?.participations ?? 0}</div>
          <span className={styles.kpiSub}>Registered giveaway participations</span>
        </div>

        <div className={`${styles.kpiCard} vl-card`}>
          <span className={styles.kpiLabel}>Claim Fulfillment Rate</span>
          <div className={styles.kpiValue}>{claimCompletionRate}%</div>
          <span className={styles.kpiSub}>{stats?.completedClaims ?? 0} completed of {totalClaimsCount} total claims</span>
        </div>

        <div className={`${styles.kpiCard} vl-card`}>
          <span className={styles.kpiLabel}>Total Campaigns</span>
          <div className={styles.kpiValue}>{stats?.giveaways ?? 0}</div>
          <span className={styles.kpiSub}>{stats?.giveawaysActive ?? 0} live active campaigns</span>
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className={styles.sectionGrid}>
        {/* Currency Breakdown */}
        <div className={`${styles.card} vl-card`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <CreditCard size={18} className={styles.cardIcon} /> Entry Fee Currency Distribution
            </h2>
          </div>

          <div className={styles.barsList}>
            {Object.keys(currencyTotals).length === 0 ? (
              <p style={{ color: 'var(--vl-text-muted)', fontSize: '0.9rem' }}>No fee transactions recorded yet.</p>
            ) : (
              Object.entries(currencyTotals).map(([cur, amt]) => {
                const pct = Math.round((amt / totalVolume) * 100);
                const fillClass =
                  cur === 'VE'
                    ? styles.fillViolet
                    : cur === 'SVE'
                    ? styles.fillGreen
                    : styles.fillGold;
                return (
                  <div key={cur} className={styles.barItem}>
                    <div className={styles.barMeta}>
                      <span className={styles.barLabel}>{cur} Currency</span>
                      <span className={styles.barValue}>
                        {amt.toLocaleString()} {cur} ({pct}%)
                      </span>
                    </div>
                    <div className={styles.barTrack}>
                      <div className={`${styles.barFill} ${fillClass}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top Campaigns by Entrants */}
        <div className={`${styles.card} vl-card`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <TrendingUp size={18} className={styles.cardIcon} /> Campaign Participation Leaders
            </h2>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Campaign Title</th>
                  <th>Status</th>
                  <th>Total Entries</th>
                </tr>
              </thead>
              <tbody>
                {giveaways.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', color: 'var(--vl-text-faint)' }}>
                      No campaigns found.
                    </td>
                  </tr>
                ) : (
                  giveaways.slice(0, 5).map((g) => (
                    <tr key={g._id}>
                      <td style={{ fontWeight: 600 }}>{g.title}</td>
                      <td>
                        <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--vl-violet-300)' }}>
                          {g.status}
                        </span>
                      </td>
                      <td>
                        <strong>{g.stats?.participationCount ?? 0}</strong> entrants
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
