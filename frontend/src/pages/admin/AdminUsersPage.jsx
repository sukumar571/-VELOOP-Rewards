import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Filter, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';
import { fetchUserList } from '../../services/adminService.js';
import styles from './AdminUsersPage.module.css';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const query = { page, limit: 20 };
      if (search.trim()) query.search = search.trim();
      if (statusFilter) query.status = statusFilter;
      if (roleFilter) query.role = roleFilter;

      const res = await fetchUserList(query);
      setUsers(res.items || []);
      setMeta(res.meta || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load users directory.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, roleFilter]);

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h2 className={styles.pageTitle}>User Account Directory</h2>
          <p className={styles.pageLead}>
            Inspect registered accounts, server-side confirmed role assignments, and authentication providers.
          </p>
        </div>

        <div className={styles.filters}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search email, name, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={styles.select}>
            <option value="">All Roles</option>
            <option value="admin">Administrators</option>
            <option value="user">Standard Members</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={styles.select}>
            <option value="">All Account Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>
      </div>

      <div className={`${styles.tableCard} vl-card`}>
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Loading user accounts...</span>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <AlertTriangle size={24} />
            <p>{error}</p>
            <button type="button" className="vl-btn vl-btn-outline vl-btn-sm" onClick={() => loadData(1)}>
              Retry
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className={styles.emptyBox}>
            <Users size={36} />
            <h3>No Users Found</h3>
            <p>No user records match the active search and filter criteria.</p>
          </div>
        ) : (
          <div className={styles.tableResponsive}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User Subject ID</th>
                  <th>Member Info</th>
                  <th>Assigned Roles</th>
                  <th>Auth Provider</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <code>{u.veloopId}</code>
                    </td>
                    <td>
                      <div className={styles.memberCell}>
                        <strong>{u.displayName || u.publicAlias || 'Member'}</strong>
                        <span className={styles.emailText}>{u.email || 'External account (No email)'}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.rolesList}>
                        {(u.roles || ['user']).map((r) => (
                          <span
                            key={r}
                            className={`${styles.roleBadge} ${r === 'admin' ? styles.roleAdmin : styles.roleUser}`}
                          >
                            {r === 'admin' && <ShieldCheck size={12} />}
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={styles.providerBadge}>{u.authProvider}</span>
                    </td>
                    <td>
                      <div className={styles.dateCell}>
                        <Clock size={12} />
                        <span>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : 'Never'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.statusChip} ${styles[`status_${u.status}`]}`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className={styles.pagination}>
            <span className={styles.pageMeta}>
              Page {meta.page} of {meta.totalPages} ({meta.total} accounts)
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => loadData(meta.page - 1)}
                className="vl-btn vl-btn-ghost vl-btn-sm"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => loadData(meta.page + 1)}
                className="vl-btn vl-btn-ghost vl-btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
