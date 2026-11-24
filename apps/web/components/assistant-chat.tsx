'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Api = (path: string, body?: any, method?: string) => Promise<any>;
type Proposal = { proposal_id: string; name: string; reference?: string };
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposal?: Proposal;
};

export function AssistantChat({ api }: { api: Api }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hola. Puedo resumir el rendimiento de los dentistas con datos de DentalRisk o ayudarte a preparar el registro de un paciente. Las cifras de servicios no representan pagos ni utilidad.',
    },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    api('/assistant/status')
      .then((status) => {
        if (current) setProviderConfigured(Boolean(status.configured));
      })
      .catch(() => {
        if (current) setProviderConfigured(false);
      });
    return () => {
      current = false;
    };
  }, [api]);

  async function send(text = draft) {
    const content = text.trim();
    if (!content || sending) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content };
    const next = [...messages, userMessage];
    setMessages(next);
    setDraft('');
    setSending(true);
    setError('');
    try {
      const result = await api('/assistant/chat', {
        messages: next.slice(-12).map(({ role, content: message }) => ({ role, content: message })),
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.message,
          ...(result.patient_proposal ? { proposal: result.patient_proposal as Proposal } : {}),
        },
      ]);
    } catch (e) {
      setError((e as Error).message || 'No se pudo contactar a Denti.');
    } finally {
      setSending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send();
  }

  async function confirm(messageId: string, proposal: Proposal, approved: boolean) {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const result = await api('/assistant/patients/confirm', {
        proposal_id: proposal.proposal_id,
        approved,
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: result.message, proposal: undefined }
            : message,
        ),
      );
    } catch (e) {
      setError((e as Error).message || 'No se pudo confirmar el alta.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="assistant-layout" aria-label="Asistente Denti">
      <div className="assistant-intro">
        <div className="assistant-branding">
          <img className="assistant-logo" src="/brand/denti-logo.png" alt="Denti" />
          <p>Asistente privado para la dirección de la clínica</p>
        </div>
        <span className="assistant-access">Solo dueño</span>
        <span className={'assistant-provider ' + (providerConfigured ? 'ready' : '')}>
          {providerConfigured === null ? 'Revisando IA…' : providerConfigured ? 'IA configurada' : 'Configurar IA'}
        </span>
      </div>
      <div className="assistant-notice">
        Denti consulta funciones autorizadas de DentalRisk. No genera diagnósticos. El valor de servicios
        completados no equivale a pagos recibidos ni a utilidad. Tus mensajes se envían al proveedor de IA
        configurado por la clínica; evita incluir datos clínicos que no sean necesarios.
      </div>
      {providerConfigured === false && (
        <div className="alert error" role="status">
          El chat está integrado, pero todavía no hay un proveedor de IA configurado en el servidor. Pide a
          administración que configure AGENT_CHAT_BASE_URL, AGENT_CHAT_MODEL y la credencial necesaria.
        </div>
      )}
      <div className="assistant-suggestions" aria-label="Preguntas sugeridas">
        <button type="button" disabled={sending} onClick={() => send('Resume el rendimiento de mis dentistas.')}>
          Rendimiento del equipo
        </button>
        <button type="button" disabled={sending} onClick={() => send('Ayúdame a registrar un paciente.')}>
          Registrar paciente
        </button>
      </div>
      <div className="assistant-transcript" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={'assistant-message ' + message.role}>
            <span className="assistant-author">{message.role === 'assistant' ? 'Denti' : 'Tú'}</span>
            <p>{message.content}</p>
            {message.proposal && (
              <div className="assistant-confirm">
                <strong>Nuevo paciente</strong>
                <dl>
                  <div><dt>Nombre</dt><dd>{message.proposal.name}</dd></div>
                  <div><dt>Folio</dt><dd>{message.proposal.reference ?? 'DentalRisk lo asignará al guardar'}</dd></div>
                </dl>
                <div className="assistant-confirm-actions">
                  <button type="button" className="primary" disabled={sending} onClick={() => confirm(message.id, message.proposal!, true)}>
                    Confirmar registro
                  </button>
                  <button type="button" disabled={sending} onClick={() => confirm(message.id, message.proposal!, false)}>
                    Cancelar
                  </button>
                </div>
                <small>El registro no se crea hasta que confirmes.</small>
              </div>
            )}
          </article>
        ))}
        {sending && <p className="assistant-pending" role="status">Denti está consultando…</p>}
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <form className="assistant-composer" onSubmit={submit}>
        <label htmlFor="assistant-input">Pregunta a Denti</label>
        <textarea
          id="assistant-input"
          value={draft}
          maxLength={4000}
          rows={3}
          placeholder="Por ejemplo: ¿Cuántas atenciones completó la Dra. García este mes?"
          onChange={(event) => setDraft(event.target.value)}
          disabled={sending || providerConfigured !== true}
        />
        <div>
          <small>Evita incluir datos clínicos sensibles que no sean necesarios.</small>
          <button type="submit" className="primary" disabled={sending || providerConfigured !== true || !draft.trim()}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </section>
  );
}
