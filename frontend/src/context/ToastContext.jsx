import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import styles from './ToastContext.module.css';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item = {
      id,
      type: toast.type || 'info', // 'success' | 'error' | 'info'
      message: toast.message,
      duration: toast.duration || 4500,
    };
    setToasts((prev) => [...prev, item]);

    if (item.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, item.duration);
    }
    return id;
  }, [removeToast]);

  const showSuccess = useCallback((message, duration) => {
    return addToast({ type: 'success', message, duration });
  }, [addToast]);

  const showError = useCallback((message, duration) => {
    return addToast({ type: 'error', message, duration });
  }, [addToast]);

  const showInfo = useCallback((message, duration) => {
    return addToast({ type: 'info', message, duration });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, showSuccess, showError, showInfo }}>
      {children}
      <div className={styles.toastContainer} role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.type] || styles.info}`}
            role="alert"
          >
            <div className={styles.toastIcon}>
              {toast.type === 'success' && <CheckCircle2 size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
            </div>
            <div className={styles.toastMessage}>{toast.message}</div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Return safe fallbacks if accessed outside provider
    return {
      addToast: () => {},
      removeToast: () => {},
      showSuccess: (msg) => console.log('Toast [success]:', msg),
      showError: (msg) => console.error('Toast [error]:', msg),
      showInfo: (msg) => console.info('Toast [info]:', msg),
    };
  }
  return ctx;
}
