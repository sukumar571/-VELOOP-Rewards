import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Gift,
  Sparkles,
  Clock,
  CheckCircle2,
  Users,
  Trophy,
  AlertCircle,
  PackageCheck,
  ArrowRight,
  Activity,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { fetchStats, fetchGiveaways, fetchAuditTrail, fetchClaimsQueue, fetchFraudQueue } from '../../services/adminService.js';
import styles from './AdminOverviewPage.module.css';

export default function AdminOverviewPage() {
  const [stats, setStats] = useState(null);
  const [giveaways, setGiveaways] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [pendingClaimsCount, setPendingClaimsCount] = useState(0);
  const [openFraudCount, setOpenFraudCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [statsData, giveawayRes, auditRes, claimsRes, fraudRes] = await Promise.all([
          fetchStats(),
          fetchGiveaways({ limit: 5, sort: 'createdAt', order: 'desc' }),
          fetchAuditTrail({ limit: 6 }),
          fetchClaimsQueue({ status: 'SUBMITTED', limit: 1 }),
          fetchFraudQueue({ status: 'OPEN', limit: 1 }),
        ]);

        if (!alive) return;
        setStats(statsData);
        setGiveaways(giveawayRes.items || []);
        setAuditLogs(auditRes.items || []);
        setPendingClaimsCount(claimsRes.meta?.total || 0);
        setOpenFraudCount(fraudRes.meta?.total || 0);
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load dashboard metrics.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
        <p>Loading administrative dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.errorCard} vl-card`}>
        <AlertCircle size={32} className={styles.errorIcon} />
        <h2>Dashboard Unavailable</h2>
        <p>{error}</p>
        <button
          type="button"
          className="vl-btn vl-btn-outline"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 8 Core KPI Metric Cards */}
      <section className={styles.metricsGrid} aria-label="Key Performance Indicators">
        {/* 1. Total Giveaways */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Giveaways</span>
            <div className={`${styles.metricIconWrap} ${styles.iconViolet}`}>
              <Gift size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.giveaways ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/giveaways" className={styles.cardLink}>
              All campaigns <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 2. Active Giveaways */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Active Giveaways</span>
            <div className={`${styles.metricIconWrap} ${styles.iconGreen}`}>
              <Sparkles size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.giveawaysActive ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/giveaways?status=ACTIVE" className={styles.cardLink}>
              Live draws <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 3. Upcoming Giveaways */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Upcoming Giveaways</span>
            <div className={`${styles.metricIconWrap} ${styles.iconBlue}`}>
              <Clock size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.giveawaysUpcoming ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/giveaways?status=UPCOMING" className={styles.cardLink}>
              Scheduled draws <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 4. Completed Giveaways */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Completed Giveaways</span>
            <div className={`${styles.metricIconWrap} ${styles.iconAmber}`}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.giveawaysCompleted ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/giveaways?status=ENDED" className={styles.cardLink}>
              Ended & archived <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 5. Total Participants */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Participants</span>
            <div className={`${styles.metricIconWrap} ${styles.iconCyan}`}>
              <Users size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.participations ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/participants" className={styles.cardLink}>
              View participants <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 6. Total Winners */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Total Winners</span>
            <div className={`${styles.metricIconWrap} ${styles.iconGold}`}>
              <Trophy size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.totalWinners ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/winners" className={styles.cardLink}>
              Winner registry <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 7. Pending Prize Claims */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Pending Prize Claims</span>
            <div className={`${styles.metricIconWrap} ${styles.iconAmber}`}>
              <AlertCircle size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.pendingClaims ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/claims" className={styles.cardLink}>
              Fulfillment queue <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        {/* 8. Completed Prize Claims */}
        <div className={`${styles.metricCard} vl-card`}>
          <div className={styles.metricHeader}>
            <span className={styles.metricLabel}>Completed Prize Claims</span>
            <div className={`${styles.metricIconWrap} ${styles.iconGreen}`}>
              <PackageCheck size={20} />
            </div>
          </div>
          <div className={styles.metricValue}>{stats?.completedClaims ?? 0}</div>
          <div className={styles.metricFooter}>
            <Link to="/admin/claims?status=COMPLETED" className={styles.cardLink}>
              Delivered prizes <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Action Banners */}
      <section className={styles.attentionGrid}>
        <div className={`${styles.attentionCard} ${styles.claimsBanner} vl-card`}>
          <div className={styles.attentionContent}>
            <div className={styles.attentionIconWrap}>
              <PackageCheck size={24} />
            </div>
            <div>
              <h3 className={styles.attentionTitle}>Pending Prize Claims</h3>
              <p className={styles.attentionText}>
                {pendingClaimsCount} claim(s) submitted awaiting fulfillment review.
              </p>
            </div>
          </div>
          <Link to="/admin/claims" className="vl-btn vl-btn-outline vl-btn-sm">
            Review Queue
          </Link>
        </div>

        <div className={`${styles.attentionCard} ${styles.fraudBanner} vl-card`}>
          <div className={styles.attentionContent}>
            <div className={styles.attentionIconWrap}>
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className={styles.attentionTitle}>Suspicious Activity Alerts</h3>
              <p className={styles.attentionText}>
                {openFraudCount} open anomaly detection flag(s) in review queue.
              </p>
            </div>
          </div>
          <Link to="/admin/fraud" className="vl-btn vl-btn-outline vl-btn-sm">
            Inspect Flags
          </Link>
        </div>
      </section>

      {/* Split section: Recent Giveaways & Live Audit Log */}
      <div className={styles.splitGrid}>
        {/* Recent Giveaways */}
        <section className={`${styles.sectionCard} vl-card`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleWrap}>
              <Sparkles size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Recent Giveaways</h2>
            </div>
            <Link to="/admin/giveaways" className={styles.viewAllLink}>
              View all
            </Link>
          </div>

          <div className={styles.giveawayList}>
            {giveaways.length === 0 ? (
              <p className={styles.emptyText}>No giveaways configured yet.</p>
            ) : (
              giveaways.map((g) => (
                <div key={g._id} className={styles.giveawayRow}>
                  <div className={styles.giveawayMeta}>
                    <Link to={`/admin/giveaways/${g._id}`} className={styles.giveawayName}>
                      {g.title}
                    </Link>
                    <div className={styles.giveawayBadges}>
                      <span className={`${styles.statusChip} ${styles[`status_${g.status}`]}`}>
                        {g.status}
                      </span>
                      <span className={g.published ? styles.pubYes : styles.pubNo}>
                        {g.published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.giveawayStats}>
                    <span className={styles.statCount}>
                      {g.stats?.participationCount ?? 0} entries
                    </span>
                    <Link to={`/admin/giveaways/${g._id}`} className={styles.manageBtn}>
                      Manage
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Live Audit Trail */}
        <section className={`${styles.sectionCard} vl-card`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleWrap}>
              <Activity size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Recent Audit Activity</h2>
            </div>
            <Link to="/admin/audit-logs" className={styles.viewAllLink}>
              View trail
            </Link>
          </div>

          <div className={styles.auditList}>
            {auditLogs.length === 0 ? (
              <p className={styles.emptyText}>No audit entries recorded.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id || log._id} className={styles.auditRow}>
                  <div className={styles.auditIconWrap}>
                    <FileText size={15} />
                  </div>
                  <div className={styles.auditMeta}>
                    <div className={styles.auditAction}>
                      <strong>{log.action}</strong> on <code>{log.entityType}</code>
                    </div>
                    <div className={styles.auditTime}>
                      <Clock size={12} />
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
