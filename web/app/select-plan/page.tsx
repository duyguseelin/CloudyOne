"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { updatePlan } from "@/lib/api";

const plans = [
  {
    id: "FREE",
    name: "Başlangıç",
    storage: "1 GB",
    features: [
      "1 GB depolama alanı",
      "1 GB çöp kutusu",
      "256-bit AES şifreleme",
      "Hızlı Transfer (şifreli link)",
      "SSL/TLS güvenlik"
    ]
  },
  {
    id: "PRO",
    name: "Pro",
    storage: "100 GB",
    features: [
      "100 GB depolama alanı",
      "10 GB çöp kutusu",
      "Tüm Başlangıç özellikler",
      "Şifreli dosya paylaşımı",
      "Dosya sürüm geçmişi",
      "İki faktörlü doğrulama (2FA)"
    ]
  },
  {
    id: "BUSINESS",
    name: "İşletme",
    storage: "1 TB",
    features: [
      "1 TB depolama alanı",
      "50 GB çöp kutusu",
      "Tüm Pro özellikler",
      "Gelişmiş şifreleme seçenekleri",
      "Öncelikli e-posta desteği",
      "Detaylı güvenlik logları"
    ]
  }
];

export default function SelectPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState("FREE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    // URL'de ?change=true varsa, kullanıcı plan değiştirmek için gelmiştir
    const isChanging = searchParams.get('change') === 'true';
    setShowCancel(isChanging);
  }, [searchParams]);

  async function handleContinue() {
    setError(null);
    setLoading(true);

    try {
      await updatePlan(selectedPlan);
      router.push("/files");
    } catch (err: any) {
      setError(err.message || "Plan seçilemedi");
      setLoading(false);
    }
  }

  return (
    <div className="select-plan-page">
      <div className="select-plan-container">
        <div className="select-plan-header">
          <h1 className="select-plan-title">Planınızı Seçin</h1>
          <p className="select-plan-subtitle">
            İhtiyacınıza en uygun depolama planını seçin ve hemen başlayın
          </p>
        </div>

        <div className="select-plan-grid">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`select-plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className="plan-check">
                {selectedPlan === plan.id && (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h3 className="plan-name" style={{ margin: 0 }}>{plan.name}</h3>
              </div>
              <div className="plan-storage">{plan.storage}</div>
              
              <ul className="plan-features">
                {plan.features.map((feature, index) => (
                  <li key={index}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {error && (
          <div className="select-plan-error">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {showCancel && (
            <button
              className="select-plan-cancel"
              onClick={() => router.back()}
              disabled={loading}
            >
              İptal
            </button>
          )}
          <button
            className="select-plan-button"
            onClick={handleContinue}
            disabled={loading}
            style={showCancel ? {} : { maxWidth: '300px', margin: '0 auto' }}
          >
            {loading ? "Yükleniyor..." : "Plana Geç"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .select-plan-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          padding: 4rem 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .select-plan-container {
          max-width: 1200px;
          width: 100%;
        }

        .select-plan-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .select-plan-title {
          font-size: 2.5rem;
          font-weight: 800;
          color: white;
          margin: 0 0 1rem;
        }

        .select-plan-subtitle {
          font-size: 1.125rem;
          color: #94a3b8;
          margin: 0;
        }

        .select-plan-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 2rem;
          margin-bottom: 3rem;
        }

        .select-plan-card {
          background: rgba(30, 41, 59, 0.5);
          border: 2px solid rgba(100, 116, 139, 0.3);
          border-radius: 20px;
          padding: 2rem;
          cursor: pointer;
          transition: all 0.3s;
          position: relative;
        }

        .select-plan-card:hover {
          border-color: rgba(139, 92, 246, 0.5);
          transform: translateY(-4px);
        }

        .select-plan-card.selected {
          border-color: #8b5cf6;
          background: rgba(139, 92, 246, 0.1);
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.2);
        }

        .plan-check {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }

        .select-plan-card.selected .plan-check {
          background: #8b5cf6;
          border-color: #8b5cf6;
          color: white;
        }

        .plan-name {
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          margin: 0 0 1rem;
        }

        .plan-storage {
          font-size: 2rem;
          font-weight: 800;
          color: white;
          margin-bottom: 2rem;
        }

        .plan-features {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .plan-features li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #cbd5e1;
          font-size: 0.95rem;
        }

        .plan-features svg {
          color: #8b5cf6;
          flex-shrink: 0;
        }

        .select-plan-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          padding: 1rem;
          color: #fca5a5;
          text-align: center;
          margin-bottom: 2rem;
        }

        .select-plan-button {
          flex: 1;
          max-width: 300px;
          padding: 0.875rem 1.5rem;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
        }

        .select-plan-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(139, 92, 246, 0.6);
        }

        .select-plan-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .select-plan-cancel {
          flex: 1;
          max-width: 300px;
          padding: 0.875rem 1.5rem;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }

        .select-plan-cancel:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        .select-plan-cancel:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .select-plan-title {
            font-size: 2rem;
          }

          .select-plan-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
