import { createContext, useContext, useState, type ReactNode } from 'react';

type ModalType = 'confirm' | 'alert' | 'danger';

interface ModalOptions {
  title: string;
  message: string;
  type?: ModalType;
  confirmText?: string;
  cancelText?: string;
}

interface ModalContextType {
  confirm: (options: ModalOptions) => Promise<boolean>;
  alert: (options: ModalOptions) => Promise<void>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<(ModalOptions & { resolve: (val: boolean) => void }) | null>(null);

  const confirm = (options: ModalOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({ ...options, resolve });
    });
  };

  const alert = (options: ModalOptions): Promise<void> => {
    return new Promise((resolve) => {
      setModal({ 
        ...options, 
        type: options.type || 'alert',
        cancelText: '', // Remove cancel for alerts
        resolve: () => resolve() 
      });
    });
  };

  const handleClose = (result: boolean) => {
    if (modal) {
      modal.resolve(result);
      setModal(null);
    }
  };

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}
      {modal && (
        <ConfirmModal 
          {...modal} 
          onConfirm={() => handleClose(true)} 
          onCancel={() => handleClose(false)} 
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModal must be used within a ModalProvider');
  return context;
}

// ── Internal Modal Component ──
function ConfirmModal({ 
  title, 
  message, 
  type = 'confirm', 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  onConfirm, 
  onCancel 
}: ModalOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="card-glass modal-content" 
        style={{ 
          maxWidth: 400, 
          width: '90%', 
          padding: 32, 
          textAlign: 'center',
          animation: 'modalScaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>
          {type === 'danger' ? '⚠️' : type === 'alert' ? 'ℹ️' : '❓'}
        </div>
        
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 32 }}>{message}</p>
        
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {cancelText && (
            <button 
              className="btn btn-secondary" 
              onClick={onCancel}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {cancelText}
            </button>
          )}
          <button 
            className={`btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`} 
            onClick={onConfirm}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
