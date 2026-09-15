"use client";

import { ExternalLink, LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { hasSupabaseEnv, supabase } from "@/lib/supabase/client";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
};

const scopeLabels: Record<string, string> = {
  openid: "Confirmar sua identidade",
  email: "Consultar o email da conta",
  profile: "Consultar os dados básicos do perfil",
};

function ConsentFlow() {
  const searchParams = useSearchParams();
  const authorizationId = searchParams.get("authorization_id");
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const setupError = !hasSupabaseEnv || !supabase
    ? "A integração OAuth requer o Supabase configurado."
    : !authorizationId
      ? "Pedido de autorização inválido."
      : null;

  useEffect(() => {
    if (!supabase || !authorizationId) return;

    let active = true;
    void supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data) {
        setError(authError?.message ?? "Não foi possível validar este pedido.");
        return;
      }
      if ("redirect_url" in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data as AuthorizationDetails);
    });
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(decision: "approve" | "deny") {
    if (!supabase || !authorizationId) return;
    setSubmitting(decision);
    setError(null);
    const response = decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (response.error || !response.data) {
      setError(response.error?.message ?? "Não foi possível concluir a autorização.");
      setSubmitting(null);
      return;
    }
    window.location.assign(response.data.redirect_url);
  }

  if (setupError || (error && !details)) {
    return (
      <main className="oauth-consent-screen">
        <section className="oauth-consent-card">
          <p className="eyebrow">UniFlow</p>
          <h1>Integração indisponível</h1>
          <p className="form-message error-message" role="alert">{setupError ?? error}</p>
        </section>
      </main>
    );
  }

  if (!details) return <main className="loading-screen">Validando integração...</main>;
  const scopes = details.scope.split(/\s+/).filter(Boolean);

  return (
    <main className="oauth-consent-screen">
      <section className="oauth-consent-card">
        <div className="oauth-consent-icon"><LockKeyhole aria-hidden size={22} /></div>
        <p className="eyebrow">UniFlow</p>
        <h1>Autorizar {details.client.name}</h1>
        <p className="oauth-consent-copy">
          Esta integração poderá consultar seus dados de estudo pelo servidor seguro do UniFlow.
          Ela não recebe ferramentas para criar, alterar ou excluir informações.
        </p>
        <div className="oauth-consent-account">
          <span>Conta conectada</span>
          <strong>{details.user.email}</strong>
        </div>
        <div className="oauth-consent-permissions">
          <span>Permissões solicitadas</span>
          <ul>
            {scopes.map((scope) => <li key={scope}>{scopeLabels[scope] ?? scope}</li>)}
            <li>Consultar matérias, prazos, materiais e revisões</li>
          </ul>
        </div>
        {details.client.uri ? (
          <a className="oauth-client-link" href={details.client.uri} rel="noreferrer" target="_blank">
            Ver site da integração<ExternalLink aria-hidden size={14} />
          </a>
        ) : null}
        {error ? <p className="form-message error-message" role="alert">{error}</p> : null}
        <div className="oauth-consent-actions">
          <button className="ghost-action" disabled={Boolean(submitting)} onClick={() => void decide("deny")} type="button">
            {submitting === "deny" ? "Recusando..." : "Recusar"}
          </button>
          <button className={`primary-button ${submitting === "approve" ? "is-loading" : ""}`} disabled={Boolean(submitting)} onClick={() => void decide("approve")} type="button">
            {submitting === "approve" ? "Autorizando..." : "Autorizar consulta"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={<main className="loading-screen">Validando integração...</main>}>
      <ConsentFlow />
    </Suspense>
  );
}
