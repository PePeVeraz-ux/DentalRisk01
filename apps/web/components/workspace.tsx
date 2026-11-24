'use client';
import { createContext, useContext, useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { DateTime } from 'luxon';
import { ExecutiveDashboard } from './executive-dashboard';
import { AssistantChat } from './assistant-chat';
import { modules, workspaceRoles, type Role } from '../lib/workspaces';

type Item = Record<string, any>;
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string;
  required?: boolean;
  values?: [string, string][];
  autoComplete?: string;
};
const labels: Record<string, string> = {
  ADMIN: 'Dueño / Administración',
  RECEPTION: 'Recepción',
  DENTIST: 'Dentista',
  SUPPORT: 'Soporte',
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En atención',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  INCIDENT: 'Incidencia',
  AVAILABLE: 'Disponible',
  ASSIGNED: 'Asignada',
  BLOCKED: 'Bloqueada',
  SCHEDULED: 'Programada',
  ATTENDED: 'Atendida',
};
const money = (c: any) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(c ?? 0) / 100);
const stamp = (s: any, timezone = 'America/Tijuana') =>
  s ? DateTime.fromISO(String(s)).setZone(timezone).toFormat('dd/MM/yyyy HH:mm:ss') : '—';
const localInput = (s: string, timezone = 'America/Tijuana') =>
  DateTime.fromISO(s).setZone(timezone).toFormat("yyyy-MM-dd'T'HH:mm");
const today = () => new Date().toLocaleDateString('en-CA');
const names = (row: Item) => row.name ?? row.uid ?? row.reference ?? row.id;
function AppSkeleton() {
  return (
    <main className="app-skeleton" aria-label="Cargando DentalRisk" aria-busy="true">
      <aside className="skeleton-sidebar" aria-hidden="true">
        <div className="skeleton-brand-row">
          <img src="/brand/dentalrisk-mark.png" alt="" />
          <span className="skeleton skeleton-brand-line" />
        </div>
        <span className="skeleton skeleton-workspace-line" />
        <div className="skeleton-nav-list">
          {Array.from({ length: 7 }, (_, index) => (
            <div className="skeleton-nav-row" key={index}>
              <span className="skeleton skeleton-nav-icon" />
              <span className="skeleton skeleton-nav-label" />
            </div>
          ))}
        </div>
      </aside>
      <section className="skeleton-main" aria-hidden="true">
        <div className="skeleton-topbar">
          <span className="skeleton skeleton-breadcrumb-line" />
          <span className="skeleton skeleton-date-line" />
        </div>
        <div className="skeleton-content">
          <span className="skeleton skeleton-eyebrow-line" />
          <span className="skeleton skeleton-title-line" />
          <span className="skeleton skeleton-copy-line" />
          <div className="skeleton-card-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="skeleton-card" key={index}>
                <span className="skeleton skeleton-card-label" />
                <span className="skeleton skeleton-card-value" />
              </div>
            ))}
          </div>
          <div className="skeleton skeleton-panel-block" />
        </div>
      </section>
    </main>
  );
}
function SimulatorSelect({
  label,
  name,
  items,
  valueOf,
}: {
  label: string;
  name: string;
  items: Item[];
  valueOf: (item: Item) => string;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const matches = items.filter((item) =>
    String(names(item)).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const selectedItem = items.find((item) => valueOf(item) === selected);
  if (selectedItem && !matches.some((item) => valueOf(item) === selected)) matches.unshift(selectedItem);
  return (
    <div className="simulator-select">
      <label>
        Buscar {label.toLocaleLowerCase()}
        <input
          aria-label={`Buscar ${label.toLocaleLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={label === 'Estación' ? 'Buscar por nombre…' : 'Buscar por UID…'}
        />
      </label>
      <label>
        {label}
        <select
          aria-label={label}
          name={name}
          required
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Seleccionar…</option>
          {matches.map((item) => (
            <option key={item.id} value={valueOf(item)}>
              {names(item)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
const catalogConfig: Record<string, { title: string; fields: Field[]; columns: [string, string][] }> = {
  patients: {
    title: 'Pacientes',
    fields: [
      { key: 'name', label: 'Nombre' },
      { key: 'reference', label: 'Folio de paciente', required: false },
      {
        key: 'active',
        label: 'Estado',
        type: 'boolean',
        values: [
          ['true', 'Activo'],
          ['false', 'Inactivo'],
        ],
      },
    ],
    columns: [
      ['name', 'Paciente'],
      ['reference', 'Folio'],
      ['active', 'Activo'],
    ],
  },
  services: {
    title: 'Servicios',
    fields: [
      { key: 'name', label: 'Servicio' },
      { key: 'price_cents', label: 'Precio en MXN', type: 'money' },
    ],
    columns: [
      ['name', 'Servicio'],
      ['price_cents', 'Precio'],
      ['active', 'Activo'],
    ],
  },
  dentists: {
    title: 'Especialistas',
    fields: [
      { key: 'name', label: 'Nombre' },
      { key: 'specialty', label: 'Especialidad', required: false },
    ],
    columns: [
      ['name', 'Especialista'],
      ['specialty', 'Especialidad'],
      ['active', 'Activo'],
    ],
  },
  stations: {
    title: 'Estaciones',
    fields: [{ key: 'name', label: 'Nombre de estación' }],
    columns: [
      ['name', 'Estación'],
      ['active', 'Activa'],
    ],
  },
  cards: {
    title: 'Tarjetas RFID',
    fields: [{ key: 'uid', label: 'UID de tarjeta' }],
    columns: [
      ['uid', 'UID'],
      ['status', 'Estado'],
    ],
  },
  shifts: {
    title: 'Turnos',
    fields: [
      { key: 'name', label: 'Nombre' },
      {
        key: 'weekday',
        label: 'Día de semana',
        values: [
          ['0', 'Domingo'],
          ['1', 'Lunes'],
          ['2', 'Martes'],
          ['3', 'Miércoles'],
          ['4', 'Jueves'],
          ['5', 'Viernes'],
          ['6', 'Sábado'],
        ],
      },
      { key: 'start_time', label: 'Inicio', type: 'time' },
      { key: 'end_time', label: 'Fin', type: 'time' },
    ],
    columns: [
      ['name', 'Turno'],
      ['weekday', 'Día (0=domingo)'],
      ['start_time', 'Inicio'],
      ['end_time', 'Fin'],
    ],
  },
};
const UiContext = createContext<{
  data: Record<string, Item[]>;
  api: (path: string, body?: any, method?: string) => Promise<any>;
  formHandler: (
    path: string,
    fields: Field[],
    extra?: Item,
    method?: string,
  ) => (event: FormEvent<HTMLFormElement>) => Promise<void>;
  pending: boolean;
  editing: Item | null;
  setEditing: (item: Item | null) => void;
  timezone: string;
} | null>(null);
function FieldInput({ field, initial }: { field: Field; initial?: any }) {
  const { data, api } = useContext(UiContext)!;
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Item[] | null>(null);
  const [selectedRow, setSelectedRow] = useState<Item | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState(String(initial ?? ''));
  useEffect(() => {
    let cancelled = false;
    if (field.options === 'patients' && initial) {
      api('/patients/' + initial)
        .then((row) => {
          if (!cancelled) setSelectedRow(row);
        })
        .catch(() => {});
    } else setSelectedRow(null);
    return () => {
      cancelled = true;
    };
  }, [field.options, initial, api]);
  useEffect(() => {
    if (field.options === 'services') setSelectedServiceId(String(initial ?? ''));
  }, [field.options, initial]);
  useEffect(() => {
    let cancelled = false;
    if (field.options !== 'patients' || search.trim().length < 2) {
      setFound(null);
      return;
    }
    const timer = setTimeout(() => {
      api('/patients?q=' + encodeURIComponent(search))
        .then((r) => {
          if (!cancelled) setFound(r.items);
        })
        .catch(() => {
          if (!cancelled) setFound([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [field.options, search, api]);
  const required = field.required !== false;
  let items = field.options ? (data[field.options] ?? []) : [];
  if (field.options === 'patients' && found) items = found;
  if (field.options === 'patients' && selectedRow && !items.some((row) => row.id === selectedRow.id))
    items = [selectedRow, ...items];
  if (field.key === 'card_id' || field.key === 'replacement_card_id')
    items = items.filter((c) => c.status === 'AVAILABLE');
  else items = items.filter((c) => c.active !== false);
  const selectedService =
    field.options === 'services' ? items.find((row) => String(row.id) === selectedServiceId) : null;
  return (
    <label>
      {field.label}
      {field.options === 'patients' && (
        <input
          aria-label="Buscar paciente"
          placeholder="Buscar nombre o folio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {field.options || field.values ? (
        <select
          aria-label={field.label}
          name={field.key}
          required={required}
          {...(field.options === 'services'
            ? { value: selectedServiceId }
            : { defaultValue: initial ?? (field.type === 'boolean' ? 'true' : '') })}
          onChange={field.options === 'services' ? (e) => setSelectedServiceId(e.target.value) : undefined}
        >
          <option value="">Seleccionar…</option>
          {field.values
            ? field.values.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))
            : items.map((row) => (
                <option key={row.id} value={row.id}>
                  {names(row)}
                </option>
              ))}
        </select>
      ) : (
        <input
          aria-label={field.label}
          name={field.key}
          required={required}
          autoComplete={field.autoComplete}
          type={field.type === 'money' ? 'number' : (field.type ?? 'text')}
          step={field.type === 'money' ? '0.01' : undefined}
          min={field.type === 'money' ? 0 : undefined}
          maxLength={field.type === 'password' ? 128 : 150}
          defaultValue={field.type === 'money' ? Number(initial ?? 0) / 100 : (initial ?? '')}
        />
      )}
      {selectedService && (
        <small className="muted">
          Valor del servicio: {money(selectedService.price_cents)}. Se registra con la atención.
        </small>
      )}
    </label>
  );
}
function Form({
  fields,
  path,
  title,
  initial,
  method,
  extra,
  submitLabel = 'Guardar',
  description,
}: {
  fields: Field[];
  path: string;
  title: string;
  initial?: Item;
  method?: string;
  extra?: Item;
  submitLabel?: string;
  description?: string;
}) {
  const { formHandler, pending, editing, setEditing } = useContext(UiContext)!;
  return (
    <form
      className="form-grid"
      onSubmit={formHandler(path, fields, extra, method)}
      key={path}
      autoComplete="off"
    >
      <div className="form-title">{title}</div>
      {description && <p className="form-description">{description}</p>}
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} initial={initial?.[f.key]} />
      ))}
      <button className="primary" disabled={pending}>
        {pending ? 'Guardando…' : submitLabel}
      </button>
      {editing && (
        <button type="button" onClick={() => setEditing(null)}>
          Cancelar edición
        </button>
      )}
    </form>
  );
}
function Table({
  items,
  columns,
  actions,
}: {
  items: Item[];
  columns: [string, string][];
  actions?: (row: Item) => React.ReactNode;
}) {
  const { timezone } = useContext(UiContext)!;
  return (
    <div className="table-wrap">
      <table className={actions ? 'has-actions' : undefined}>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
            {actions && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map(([key]) => (
                  <td key={key}>
                    {key === 'status' ? (
                      <span className={'status ' + String(row[key]).toLowerCase()}>
                        {labels[row[key]] ?? row[key]}
                      </span>
                    ) : key.includes('price_cents') || key === 'revenue_cents' ? (
                      money(row[key])
                    ) : key === 'duration_minutes' ? (
                      row.started_at && row.ended_at ? (
                        (
                          (new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) /
                          60000
                        ).toFixed(2) + ' min'
                      ) : (
                        '—'
                      )
                    ) : key === 'appointment_time' ? (
                      DateTime.fromISO(String(row.starts_at)).setZone(timezone).toFormat('HH:mm')
                    ) : key.endsWith('_at') ? (
                      stamp(row[key], timezone)
                    ) : key === 'role' ? (
                      (labels[row[key]] ?? row[key])
                    ) : typeof row[key] === 'boolean' ? (
                      row[key] ? (
                        'Sí'
                      ) : (
                        'No'
                      )
                    ) : key === 'detail' ? (
                      <details>
                        <summary>Ver detalle</summary>
                        <pre className="audit-detail">{JSON.stringify(row[key], null, 2)}</pre>
                      </details>
                    ) : typeof row[key] === 'object' ? (
                      JSON.stringify(row[key])
                    ) : (
                      (row[key] ?? '—')
                    )}
                  </td>
                ))}
                {actions && <td className="actions">{actions(row)}</td>}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + 1}>
                <div className="empty">Sin registros para mostrar.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const pathname = usePathname();
  const [session, setSession] = useState<Item | null>(null),
    [ready, setReady] = useState(false);
  const page = modules.find((m) => m.path === pathname)?.id ?? 'dashboard';
  const [receptionView, setReceptionView] = useState<'home' | 'patients' | 'bind'>('home');
  const setPage = useCallback((id: string) => {
    const target = modules.find((m) => m.id === id);
    if (target) {
      window.history.pushState(null, '', target.path);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
    }
  }, []);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState('');
  const [data, setData] = useState<Record<string, Item[]>>({}),
    [report, setReport] = useState<Item | null>(null);
  const [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [category, setCategory] = useState('services');
  const [editing, setEditing] = useState<Item | null>(null),
    [credential, setCredential] = useState(''),
    [diagnostics, setDiagnostics] = useState<Item | null>(null);
  const [attentionPage, setAttentionPage] = useState(0),
    [appointmentPage, setAppointmentPage] = useState(0);
  const [clinicalSearch, setClinicalSearch] = useState(''),
    [totals, setTotals] = useState<Record<string, number>>({});
  const refreshSequence = useRef(0),
    busy = useRef(false);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientSearchText, setPatientSearchText] = useState('');
  const [clinicalDay, setClinicalDay] = useState(''),
    [clinicalStatus, setClinicalStatus] = useState('');
  const [overview, setOverview] = useState<Item | null>(null),
    [setup, setSetup] = useState<Item | null>(null);
  const [operationActive, setOperationActive] = useState(false);
  const [scanResult, setScanResult] = useState<Item | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const user = session?.user;
  const canOperate = user?.role === 'RECEPTION' || (user?.role === 'ADMIN' && operationActive);
  const roleInfo = workspaceRoles[(user?.role ?? 'ADMIN') as Role];
  useEffect(() => {
    if (page !== 'reception') setReceptionView('home');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [page]);
  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem('dentalrisk.sidebar-collapsed') === 'true');
    } catch {
      setSidebarCollapsed(false);
    }
  }, []);
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem('dentalrisk.sidebar-collapsed', String(next));
      } catch {
        // El menú sigue funcionando aunque el navegador bloquee el almacenamiento local.
      }
      return next;
    });
  };
  const api = useCallback(
    async (path: string, body?: any, method?: string) => {
      const response = await fetch('/api/v1' + path, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(session?.csrf ? { 'x-csrf-token': session.csrf } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 401 && path !== '/sessions') {
        setSession((current) => (current?.csrf === session?.csrf ? null : current));
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'No se pudo completar la operación');
      return result;
    },
    [session?.csrf],
  );
  useEffect(() => {
    fetch('/api/v1/sessions/me')
      .then(async (r) => {
        if (r.ok) setSession(await r.json());
      })
      .catch(() => setError('No hay conexión con el servidor'))
      .finally(() => setReady(true));
  }, []);
  const params = useCallback(
    () =>
      new URLSearchParams({
        from,
        to,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      }).toString(),
    [from, to, filters],
  );
  const refresh = useCallback(
    async (light = false) => {
      if (!user) return;
      const sequence = ++refreshSequence.current;
      const analytical = ['dashboard', 'reports', 'team'].includes(page);
      let endpoints: string[] = [];
      if (analytical && ['ADMIN', 'DENTIST'].includes(user.role))
        endpoints = ['dentists', 'services', 'stations', 'shifts'];
      if (page === 'reception' && user.role !== 'SUPPORT') {
        endpoints =
          receptionView === 'home'
            ? ['appointments']
            : receptionView === 'patients'
              ? ['patients']
              : ['dentists', 'services', 'stations', 'patients', 'cards'];
      }
      if (['appointments', 'attentions'].includes(page) && user.role !== 'SUPPORT') {
        endpoints = [
          'dentists',
          'services',
          'stations',
          'shifts',
          page === 'appointments' ? 'appointments' : 'attentions',
        ];
        if (canOperate) endpoints.push('patients', 'cards', 'incidents');
      }
      if (page === 'settings' && user.role === 'ADMIN')
        endpoints = ['services', 'dentists', 'stations', 'cards', 'shifts', 'calendar'];
      if (page === 'security') endpoints = user.role === 'ADMIN' ? ['users'] : ['audit'];
      if (light) {
        let relevant: string[] = [];
        if (page === 'reception') {
          relevant =
            receptionView === 'home'
              ? ['appointments']
              : receptionView === 'patients'
                ? ['patients']
                : ['patients', 'cards'];
        } else if (page === 'attentions') relevant = ['attentions', 'cards', 'incidents'];
        else if (page === 'appointments') relevant = ['appointments'];
        else if (page === 'settings') relevant = [category];
        else if (page === 'security') relevant = user.role === 'ADMIN' ? ['users'] : ['audit'];
        endpoints = endpoints.filter((name) => relevant.includes(name));
      }
      const results = await Promise.all(
        endpoints.map(async (endpoint) => {
          const receptionDay = new Date().toLocaleDateString('en-CA', {
            timeZone: session?.timezone ?? 'America/Tijuana',
          });
          let query = '';
          if (endpoint === 'appointments' && page === 'reception')
            query = `?limit=5&offset=0&day=${receptionDay}`;
          else if (['attentions', 'appointments'].includes(endpoint))
            query = `?limit=50&offset=${(endpoint === 'attentions' ? attentionPage : appointmentPage) * 50}&q=${encodeURIComponent(clinicalSearch)}${clinicalDay ? '&day=' + clinicalDay : ''}${clinicalStatus ? '&status=' + clinicalStatus : ''}`;
          else if (endpoint === 'patients') query = `?limit=500&q=${encodeURIComponent(patientQuery)}`;
          else if (['dentists', 'services', 'stations', 'shifts', 'cards'].includes(endpoint))
            query = '?limit=500';
          const result = await api('/' + endpoint + query);
          if (query.includes('limit=500') && result.total > result.items.length) {
            for (let offset = result.items.length; offset < result.total;) {
              const next = await api('/' + endpoint + query + `&offset=${offset}`);
              if (!next.items.length) break;
              result.items.push(...next.items);
              offset += next.items.length;
            }
          }
          return [endpoint, result] as const;
        }),
      );
      const [r, o, d, config, me] = await Promise.all([
        analytical && ['ADMIN', 'DENTIST'].includes(user.role) ? api('/reports/executive?' + params()) : null,
        ['reception', 'appointments', 'attentions'].includes(page) && user.role !== 'SUPPORT'
          ? api(
              '/operations/overview?day=' +
                new Date().toLocaleDateString('en-CA', { timeZone: session?.timezone ?? 'America/Tijuana' }),
            )
          : null,
        user.role === 'SUPPORT' && page === 'security' ? api('/diagnostics') : null,
        user.role === 'ADMIN' && ['dashboard', 'settings'].includes(page) ? api('/setup') : null,
        api('/sessions/me'),
      ]);
      if (sequence !== refreshSequence.current) return;
      setConnectionIssue('');
      setData((old) => ({
        ...old,
        ...Object.fromEntries(results.map(([key, result]) => [key, result.items])),
      }));
      setTotals((old) => ({
        ...old,
        ...Object.fromEntries(results.map(([key, result]) => [key, result.total ?? result.items.length])),
      }));
      if (r) setReport(r);
      if (o) setOverview(o);
      if (config) setSetup(config);
      if (me)
        setSession((old) =>
          old?.user.id === me.user.id ? { ...old, operation_until: me.operation_until } : old,
        );
      if (d) setDiagnostics(d);
    },
    [
      user,
      api,
      params,
      attentionPage,
      appointmentPage,
      clinicalSearch,
      page,
      receptionView,
      category,
      patientQuery,
      clinicalDay,
      clinicalStatus,
      canOperate,
      session?.timezone,
    ],
  );
  useEffect(() => {
    if (user) {
      refresh().catch((e) => setError(e.message));
      const timer = setInterval(
        () =>
          refresh(true).catch(() =>
            setConnectionIssue(
              'No se pudo actualizar. Revisa la conexión; los datos pueden estar desactualizados.',
            ),
          ),
        4000,
      );
      return () => clearInterval(timer);
    }
  }, [user, refresh]);
  useEffect(() => {
    const update = () =>
      setOperationActive(
        Boolean(session?.operation_until && new Date(session.operation_until).getTime() > Date.now()),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [session?.operation_until]);
  useEffect(() => {
    if (!user) return;
    const allowed = modules.some(
      (m) =>
        m.id === page &&
        (m.roles.includes(user.role as Role) || (user.role === 'ADMIN' && operationActive && m.operational)),
    );
    if (pathname === '/' || !allowed)
      window.history.replaceState(null, '', modules.find((m) => m.id === roleInfo.home)!.path);
  }, [user, page, pathname, operationActive, roleInfo.home]);
  useEffect(() => {
    ++refreshSequence.current;
    setData({});
    setReport(null);
    setOverview(null);
    setSetup(null);
    setFilters({});
    setEditing(null);
    setCredential('');
    setScanResult(null);
    const day = new Date().toLocaleDateString('en-CA', { timeZone: session?.timezone ?? 'America/Tijuana' });
    setFrom(day);
    setTo(day);
  }, [user?.id]);
  useEffect(() => {
    setClinicalStatus('');
    setAttentionPage(0);
    setAppointmentPage(0);
    setClinicalDay(
      page === 'appointments'
        ? new Date().toLocaleDateString('en-CA', { timeZone: session?.timezone ?? 'America/Tijuana' })
        : '',
    );
  }, [page, session?.timezone]);
  async function action(
    fn: () => Promise<any>,
    message: string | ((result: any) => string) = 'Operación completada',
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const result = await fn();
      setNotice(typeof message === 'function' ? message(result) : message);
      if (result && Object.hasOwn(result, 'operation_until')) {
        setSession((old) => (old ? { ...old, operation_until: result.operation_until } : old));
        setOperationActive(Boolean(result.operation_until));
      }
      if (result?.reauthenticate) {
        setSession(null);
        return;
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      const s = await api('/sessions', Object.fromEntries(form));
      setSession(s);
    }, 'Sesión iniciada');
  }
  function formHandler(path: string, fields: Field[], extra: Item = {}, method?: string) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const el = event.currentTarget;
      const values: Item = { ...Object.fromEntries(new FormData(el)), ...extra };
      fields.forEach((f) => {
        if (f.type === 'money') values[f.key] = Math.round(Number(values[f.key]) * 100);
        if (f.type === 'boolean') values[f.key] = values[f.key] === 'true';
        if (f.key === 'weekday') values[f.key] = Number(values[f.key]);
        if (f.type === 'datetime-local') {
          const value = DateTime.fromISO(String(values[f.key]), {
            zone: session?.timezone ?? 'America/Tijuana',
          });
          values[f.key] =
            value.isValid && value.toFormat("yyyy-MM-dd'T'HH:mm") === values[f.key]
              ? value.toUTC().toISO()
              : '';
        }
        if (values[f.key] === '' && f.required === false) delete values[f.key];
      });
      await action(
        async () => {
          const result = await api(path, values, method);
          el.reset();
          setEditing(null);
          return result;
        },
        path === '/attentions'
          ? 'Tarjeta vinculada. Entrega la tarjeta e indica que debe presentarse al entrar y al salir.'
          : path === '/patients'
            ? (result: Item) => `Paciente registrado. Folio: ${result.reference}`
            : 'Operación completada',
      );
    };
  }
  const nav = modules
    .filter(
      (n) =>
        n.roles.includes(user?.role as Role) || (user?.role === 'ADMIN' && operationActive && n.operational),
    )
    .map((n) => ({
      ...n,
      label:
        user?.role === 'DENTIST' && n.id === 'dashboard'
          ? 'Mi productividad'
          : user?.role === 'SUPPORT' && n.id === 'security'
            ? 'Diagnóstico'
            : n.label,
    }));
  if (!ready) return <AppSkeleton />;
  if (!session)
    return (
      <main className="login">
        <div className="login-story">
          <div className="brand login-brand">
            <img
              className="login-brand-logo"
              src="/brand/dentalrisk-logo.png"
              alt="DentalRisk"
            />
          </div>
          <span className="eyebrow">CONTROL OPERATIVO</span>
          <h1>
            Más claridad.
            <br />
            Mejor atención.
          </h1>
          <p>El flujo de tu clínica, los tiempos de atención y la productividad en un solo lugar.</p>
          <div className="login-foot">Recepción · Atención · Productividad</div>
        </div>
        <div className="login-form">
          <span className="eyebrow">BIENVENIDO</span>
          <h2>Accede a tu clínica</h2>
          <p>Utiliza tu cuenta individual para continuar.</p>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <form onSubmit={login}>
            <label>
              Correo electrónico
              <input type="email" name="email" autoComplete="username" required />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <button className="primary" disabled={pending}>
              {pending ? 'Ingresando…' : 'Iniciar sesión →'}
            </button>
          </form>
          <p className="muted small">Solicita al administrador tu cuenta y los permisos necesarios.</p>
        </div>
      </main>
    );
  if (!nav.some((n) => n.id === page))
    return <main className="loading">Abriendo tu espacio de trabajo…</main>;
  const title = nav.find((n) => n.id === page)?.label ?? 'DentalRisk';
  const pageTitle =
    page === 'reception'
      ? receptionView === 'home'
        ? 'Jornada de recepción'
        : receptionView === 'patients'
          ? 'Registrar o editar paciente'
          : 'Vincular tarjeta'
      : page === 'dashboard'
        ? user.role === 'ADMIN'
          ? 'Panel ejecutivo'
          : 'Mi productividad'
        : title;
  const pageDescription =
    page === 'reception'
      ? receptionView === 'home'
        ? 'Citas y acciones de la jornada.'
        : receptionView === 'patients'
          ? 'Busca coincidencias antes de dar de alta a una persona.'
          : 'Asigna paciente, servicio, dentista y tarjeta.'
      : page === 'dashboard'
        ? roleInfo.intro
        : page === 'assistant'
          ? 'Consulta el rendimiento y prepara altas de pacientes desde DentalRisk.'
          : user.role === 'ADMIN'
            ? ({
                team: 'Compara la actividad registrada por cada dentista.',
                attentions: 'Consulta tiempos, estados y devolución de tarjetas.',
                reports: 'Filtra y exporta los resultados operativos de la clínica.',
                settings: 'Configura servicios, especialistas, consultorios, tarjetas y turnos.',
                security: 'Crea cuentas y asigna el acceso correspondiente a cada persona.',
                account: 'Administra la seguridad de tu propia cuenta.',
              }[page] ?? roleInfo.intro)
            : roleInfo.intro;
  const bindingFields: Field[] = [
    { key: 'patient_id', label: 'Paciente', options: 'patients' },
    { key: 'service_id', label: 'Servicio', options: 'services' },
    { key: 'dentist_id', label: 'Dentista', options: 'dentists' },
    { key: 'station_id', label: 'Estación', options: 'stations' },
    { key: 'card_id', label: 'Tarjeta disponible', options: 'cards' },
  ];
  const appointmentFields: Field[] = [
    ...bindingFields.slice(0, 3),
    { key: 'starts_at', label: 'Inicio', type: 'datetime-local' },
    { key: 'ends_at', label: 'Fin', type: 'datetime-local' },
  ];
  const attentionTable = (
    <Table
      items={data.attentions ?? []}
      columns={[
        ['patient', 'Paciente'],
        ['service', 'Servicio'],
        ['dentist', 'Dentista'],
        ['station', 'Estación'],
        ['status', 'Estado'],
        ['started_at', 'Inicio'],
        ['ended_at', 'Fin'],
        ['duration_minutes', 'Duración'],
        ['price_cents', 'Valor'],
      ]}
      actions={
        canOperate || user.role === 'ADMIN'
          ? (a) => (
              <>
                {canOperate &&
                  !a.released_at &&
                  ['COMPLETED', 'CANCELLED', 'INCIDENT'].includes(a.status) && (
                    <button
                      onClick={() => {
                        setEditing({ ...a, mode: 'release' });
                        setPage('attentions');
                      }}
                    >
                      Liberar
                    </button>
                  )}
                {canOperate && a.status === 'PENDING' && (
                  <button
                    onClick={() => {
                      setEditing({ ...a, mode: 'cancel-attention' });
                      setPage('attentions');
                    }}
                  >
                    Cancelar
                  </button>
                )}
                {canOperate && !a.released_at && ['PENDING', 'IN_PROGRESS'].includes(a.status) && (
                  <button
                    onClick={() => {
                      setEditing({ ...a, mode: 'incident' });
                      setPage('attentions');
                    }}
                  >
                    Incidencia
                  </button>
                )}
                {user.role === 'ADMIN' && a.status === 'COMPLETED' && (
                  <button
                    onClick={() => {
                      setEditing({ ...a, mode: 'correction' });
                      setPage('attentions');
                    }}
                  >
                    Corregir
                  </button>
                )}
              </>
            )
          : undefined
      }
    />
  );
  return (
    <UiContext.Provider
      value={{
        data,
        api,
        formHandler,
        pending,
        editing,
        setEditing,
        timezone: session.timezone ?? 'America/Tijuana',
      }}
    >
      <div className={sidebarCollapsed ? 'app-shell sidebar-is-collapsed' : 'app-shell'}>
        <aside className={sidebarCollapsed ? 'sidebar collapsed' : 'sidebar'}>
          <div className="sidebar-header">
            <div className="brand">
              <img
                className="brand-mark"
                src="/brand/dentalrisk-mark.png"
                alt=""
                aria-hidden="true"
              />
              <span className="brand-name">
                Dental<span className="brand-accent">Risk</span>
              </span>
            </div>
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Retraer menú lateral'}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Expandir menú' : 'Retraer menú'}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>
          <div className="workspace">
            CLÍNICA DENTAL<span>{roleInfo.title}</span>
          </div>
          <nav className="sidebar-nav" aria-label="Navegación principal">
            {nav.map((n) => (
              <button
                key={n.id}
                aria-label={n.label}
                aria-current={page === n.id ? 'page' : undefined}
                className={page === n.id ? 'nav active' : 'nav'}
                title={sidebarCollapsed ? n.label : undefined}
                onClick={() => {
                  setPage(n.id);
                  setEditing(null);
                  setError('');
                  setCredential('');
                }}
              >
                <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                <span className="nav-label">{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div className="sidebar-user">
              <strong>{user.name}</strong>
              <small>{labels[user.role]}</small>
            </div>
            <button
              className="logout-button"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              onClick={() =>
                action(async () => {
                  await api('/sessions/logout', {});
                  setSession(null);
                  return { reauthenticate: true };
                })
              }
            >
              ↪
            </button>
          </div>
        </aside>
        <div className="workspace-main">
          <header>
            <nav className="breadcrumb" aria-label="Ruta de navegación">
              <button
                type="button"
                onClick={() => {
                  setPage(roleInfo.home);
                  setEditing(null);
                }}
              >
                Inicio
              </button>
              <span aria-hidden="true">/</span>
              {page === 'reception' && receptionView !== 'home' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReceptionView('home');
                      setEditing(null);
                    }}
                  >
                    Recepción
                  </button>
                  <span aria-hidden="true">/</span>
                </>
              )}
              <strong aria-current="page">{pageTitle}</strong>
            </nav>
            <div className="header-date">
              {new Date().toLocaleDateString('es-MX', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: session.timezone ?? 'America/Tijuana',
              })}
              <span className={'live-dot' + (connectionIssue ? ' offline' : '')} />{' '}
              {connectionIssue ? 'Sin conexión' : 'Operación local'}
            </div>
            <button
              className="mobile-logout"
              aria-label="Cerrar sesión en móvil"
              onClick={() =>
                action(async () => {
                  await api('/sessions/logout', {});
                  setSession(null);
                  return { reauthenticate: true };
                })
              }
            >
              Salir
            </button>
          </header>
          <main className="content">
            {user.role === 'ADMIN' && operationActive && (
              <div className="alert operation-banner" role="status">
                <div>
                  <strong>Acceso excepcional a recepción activo</strong>
                  <p>
                    Vence a las {stamp(session.operation_until, session.timezone)}. Las operaciones quedan
                    auditadas.
                  </p>
                </div>
                <button
                  disabled={pending}
                  onClick={() =>
                    action(async () => {
                      await api('/sessions/operation-revoke', {});
                      setSession((old) => ({ ...old, operation_until: null }));
                    }, 'Acceso operativo cerrado')
                  }
                >
                  Finalizar acceso
                </button>
              </div>
            )}
            <div className="page-heading">
              <div>
                <span className="eyebrow">DENTALRISK / {roleInfo.title.toUpperCase()}</span>
                <h1>{pageTitle}</h1>
                <p>{pageDescription}</p>
              </div>
              <button onClick={() => action(refresh, 'Información actualizada')} disabled={pending}>
                ↻ Actualizar
              </button>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {connectionIssue && (
              <div className="alert error" role="alert">
                {connectionIssue}
              </div>
            )}
            {notice && (
              <div className="alert success" role="status">
                {notice}
              </div>
            )}
            {page === 'assistant' && <AssistantChat api={api} />}
            {['attentions', 'appointments'].includes(page) && (
              <div className="toolbar clinical-toolbar">
                <label>
                  Fecha de {page === 'appointments' ? 'cita' : 'registro'}
                  <input
                    type="date"
                    value={clinicalDay}
                    onChange={(e) => {
                      setClinicalDay(e.target.value);
                      setAttentionPage(0);
                      setAppointmentPage(0);
                    }}
                  />
                </label>
                <label>
                  Estado
                  <select
                    value={clinicalStatus}
                    onChange={(e) => {
                      setClinicalStatus(e.target.value);
                      setAttentionPage(0);
                      setAppointmentPage(0);
                    }}
                  >
                    <option value="">Todos</option>
                    {(page === 'appointments'
                      ? ['SCHEDULED', 'ATTENDED', 'CANCELLED']
                      : ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'INCIDENT']
                    ).map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Buscar en registros
                  <input
                    type="search"
                    value={clinicalSearch}
                    placeholder="Paciente, folio, servicio o dentista"
                    onChange={(e) => {
                      setClinicalSearch(e.target.value);
                      setAttentionPage(0);
                      setAppointmentPage(0);
                    }}
                  />
                </label>
                <button
                  disabled={(page === 'appointments' ? appointmentPage : attentionPage) === 0}
                  onClick={() =>
                    page === 'appointments'
                      ? setAppointmentPage((p) => p - 1)
                      : setAttentionPage((p) => p - 1)
                  }
                >
                  Anterior
                </button>
                <span aria-live="polite">
                  Página {(page === 'appointments' ? appointmentPage : attentionPage) + 1} ·{' '}
                  {totals[page === 'appointments' ? 'appointments' : 'attentions'] ?? 0} registros
                </span>
                <button
                  disabled={
                    ((page === 'appointments' ? appointmentPage : attentionPage) + 1) * 50 >=
                    (totals[page === 'appointments' ? 'appointments' : 'attentions'] ?? 0)
                  }
                  onClick={() =>
                    page === 'appointments'
                      ? setAppointmentPage((p) => p + 1)
                      : setAttentionPage((p) => p + 1)
                  }
                >
                  Siguiente
                </button>
              </div>
            )}
            {['dashboard', 'reports', 'team'].includes(page) && ['ADMIN', 'DENTIST'].includes(user.role) && (
              <ExecutiveDashboard
                report={report}
                from={from}
                to={to}
                filters={filters}
                data={data}
                role={user.role}
                page={page}
                setup={setup}
                onRange={(start, end) => {
                  setFrom(start);
                  setTo(end);
                  setReport(null);
                }}
                onFilter={(key, value) => {
                  setFilters((old) => ({ ...old, [key]: value }));
                  setReport(null);
                }}
                onNavigate={setPage}
                exportQuery={params()}
              />
            )}
            {page === 'reception' && receptionView === 'home' && (
              <>
                <div className="kpis reception-kpis" aria-label="Resumen de la jornada">
                  {[
                    [
                      'Citas hoy',
                      Number(overview?.appointments.SCHEDULED ?? 0) +
                        Number(overview?.appointments.ATTENDED ?? 0),
                    ],
                    ['En atención', overview?.attentions.IN_PROGRESS ?? 0],
                    ['Tarjetas disponibles', overview?.available_cards ?? 0],
                  ].map(([label, value]) => (
                    <article className="kpi" key={label as string}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>
                        {String(label).startsWith('Citas') ? overview?.day : 'Estado operativo actual'}
                      </small>
                    </article>
                  ))}
                </div>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Citas de hoy</h2>
                      <p>Revisa hora, paciente, servicio y estado de cada cita.</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setPage('appointments');
                      }}
                    >
                      Abrir agenda
                    </button>
                  </div>
                  <Table
                    items={data.appointments ?? []}
                    columns={[
                      ['appointment_time', 'Hora'],
                      ['patient', 'Paciente'],
                      ['service', 'Servicio'],
                      ['status', 'Estado'],
                    ]}
                    actions={(appointment) =>
                      appointment.status === 'SCHEDULED' ? (
                        <button
                          onClick={() => {
                            setEditing({ ...appointment, mode: 'bind' });
                            setPage('attentions');
                          }}
                        >
                          Vincular tarjeta
                        </button>
                      ) : null
                    }
                  />
                </section>
                <div className="tabs" aria-label="Acciones de recepción">
                  <button
                    className="primary"
                    onClick={() => {
                      setEditing(null);
                      setReceptionView('patients');
                    }}
                  >
                    Registrar paciente
                  </button>
                  <button
                    onClick={() => {
                      setEditing(null);
                      setPage('appointments');
                    }}
                  >
                    Nueva cita
                  </button>
                  <button
                    onClick={() => {
                      setEditing(null);
                      setReceptionView('bind');
                    }}
                  >
                    Vincular tarjeta
                  </button>
                </div>
              </>
            )}
            {page === 'reception' && receptionView === 'patients' && (
              <>
                <button
                  onClick={() => {
                    setEditing(null);
                    setReceptionView('home');
                  }}
                >
                  ← Volver a recepción
                </button>
                <section className="panel" id="pacientes">
                  <h2>Pacientes</h2>
                  <p className="context-note">
                    Busca por nombre o folio antes de crear un registro para detectar coincidencias.
                  </p>
                  <p className="muted small">
                    Si no capturas un folio, DentalRisk asigna uno automáticamente.
                  </p>
                  <Form
                    title={editing?.mode === 'patient' ? 'Editar paciente' : 'Registro rápido'}
                    description="Para un alta nueva solo necesitas el nombre. El folio puede generarse automáticamente."
                    fields={
                      editing?.mode === 'patient'
                        ? catalogConfig.patients.fields
                        : catalogConfig.patients.fields.filter((field) => field.key !== 'active')
                    }
                    path={editing?.mode === 'patient' ? `/patients/${editing.id}` : '/patients'}
                    method={editing?.mode === 'patient' ? 'PATCH' : 'POST'}
                    initial={editing?.mode === 'patient' ? editing : undefined}
                    submitLabel="Guardar paciente"
                  />
                  <form
                    className="toolbar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPatientQuery(patientSearchText.trim());
                    }}
                  >
                    <label>
                      Buscar paciente por nombre o folio
                      <input
                        name="search"
                        type="search"
                        maxLength={100}
                        value={patientSearchText}
                        onChange={(e) => setPatientSearchText(e.target.value)}
                      />
                    </label>
                    <button>Buscar</button>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientSearchText('');
                        setPatientQuery('');
                      }}
                    >
                      Ver todos
                    </button>
                  </form>
                  <p className="muted small">
                    {totals.patients ?? 0} coincidencias. Usa el folio para una búsqueda precisa.
                  </p>
                  <Table
                    items={data.patients ?? []}
                    columns={catalogConfig.patients.columns}
                    actions={(row) => (
                      <button onClick={() => setEditing({ ...row, mode: 'patient' })}>Editar paciente</button>
                    )}
                  />
                </section>
              </>
            )}
            {page === 'reception' && receptionView === 'bind' && (
              <>
                <button
                  onClick={() => {
                    setEditing(null);
                    setReceptionView('home');
                  }}
                >
                  ← Volver a recepción
                </button>
                <section className="panel" id="vinculacion">
                  <p className="context-note">
                    Selecciona paciente, servicio, dentista, consultorio y tarjeta RFID. El precio aparece al
                    elegir el servicio.
                  </p>
                  <Form
                    title="Vincular nueva atención"
                    fields={bindingFields}
                    path="/attentions"
                    submitLabel="Confirmar vinculación"
                  />
                </section>
              </>
            )}
            {page === 'appointments' && (
              <>
                {canOperate && (
                  <section className="panel">
                    <Form
                      title={
                        editing?.mode === 'cancel-appointment'
                          ? 'Cancelar cita'
                          : editing
                            ? 'Reprogramar cita'
                            : 'Nueva cita'
                      }
                      fields={
                        editing?.mode === 'cancel-appointment'
                          ? [{ key: 'reason', label: 'Motivo de cancelación' }]
                          : appointmentFields
                      }
                      path={
                        editing?.mode === 'cancel-appointment'
                          ? `/appointments/${editing.id}/cancel`
                          : editing
                            ? `/appointments/${editing.id}`
                            : '/appointments'
                      }
                      method={editing && editing.mode !== 'cancel-appointment' ? 'PATCH' : 'POST'}
                      initial={
                        editing
                          ? {
                              ...editing,
                              starts_at: localInput(editing.starts_at, session.timezone),
                              ends_at: localInput(editing.ends_at, session.timezone),
                            }
                          : undefined
                      }
                    />
                  </section>
                )}
                <section className="panel">
                  <h2>Agenda de atención</h2>
                  <p className="muted small">
                    Horario de la clínica: {session.timezone}. Se muestran primero las citas más próximas de
                    la fecha seleccionada.
                  </p>
                  <Table
                    items={data.appointments ?? []}
                    columns={[
                      ['patient', 'Paciente'],
                      ['dentist', 'Dentista'],
                      ['service', 'Servicio'],
                      ['starts_at', 'Inicio'],
                      ['ends_at', 'Fin'],
                      ['status', 'Estado'],
                    ]}
                    actions={
                      canOperate
                        ? (a) => (
                            <>
                              {a.status === 'SCHEDULED' && (
                                <>
                                  <button onClick={() => setEditing(a)}>Reprogramar</button>
                                  <button
                                    onClick={() => {
                                      setEditing({ ...a, mode: 'cancel-appointment' });
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditing({ ...a, mode: 'bind' });
                                      setPage('attentions');
                                    }}
                                  >
                                    Vincular tarjeta
                                  </button>
                                </>
                              )}
                            </>
                          )
                        : undefined
                    }
                  />
                </section>
              </>
            )}
            {page === 'attentions' && (
              <>
                {editing?.mode === 'release' && (
                  <section className="panel confirmation-panel" aria-label="Liberar tarjeta devuelta">
                    <h2>Liberar tarjeta devuelta</h2>
                    <p>
                      {editing.patient} · {editing.service} · {labels[editing.status]}
                    </p>
                    <p>
                      Confirma que la tarjeta fue devuelta físicamente y está en buen estado. El historial de
                      la atención se conservará.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        action(async () => {
                          await api(`/attentions/${editing.id}/release`, {});
                          setEditing(null);
                        }, 'Tarjeta liberada y disponible. Historial conservado.');
                      }}
                    >
                      <label className="checkbox-label">
                        <input type="checkbox" required /> Tarjeta recibida y utilizable
                      </label>
                      <div className="actions">
                        <button className="primary" disabled={pending}>
                          Confirmar liberación
                        </button>
                        <button type="button" disabled={pending} onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </section>
                )}
                {editing?.mode === 'cancel-attention' && (
                  <section className="panel">
                    <Form
                      title="Cancelar atención pendiente"
                      path={`/attentions/${editing.id}/cancel`}
                      fields={[{ key: 'reason', label: 'Motivo de cancelación' }]}
                      submitLabel="Confirmar cancelación"
                    />
                  </section>
                )}
                {editing?.mode === 'bind' && (
                  <section className="panel">
                    <Form
                      title="Vincular tarjeta a la cita"
                      submitLabel="Confirmar vinculación"
                      fields={bindingFields}
                      initial={editing}
                      extra={{ appointment_id: editing.id }}
                      path="/attentions"
                    />
                  </section>
                )}
                {editing?.mode === 'incident' && (
                  <section className="panel">
                    <Form
                      title="Registrar incidencia de tarjeta"
                      fields={[
                        { key: 'reason', label: 'Motivo' },
                        {
                          key: 'replacement_card_id',
                          label: 'Reemplazo (opcional)',
                          options: 'cards',
                          required: false,
                        },
                      ]}
                      path={`/attentions/${editing.id}/incident`}
                    />
                    <p className="muted small">
                      Sin reemplazo, se cierra por incidencia y se excluye de servicios completados e
                      ingresos; no se inventa una hora de salida. Con reemplazo, se conservan el folio y los
                      eventos. La tarjeta anterior quedará bloqueada.
                    </p>
                  </section>
                )}
                {editing?.mode === 'correction' && (
                  <section className="panel">
                    <p className="context-note">
                      Valores anteriores: {stamp(editing.started_at, session.timezone)} →{' '}
                      {stamp(editing.ended_at, session.timezone)} · {editing.service} · {editing.dentist}. Se
                      conservarán en el historial.
                    </p>
                    <Form
                      title="Corrección administrativa con historial"
                      fields={[
                        { key: 'reason', label: 'Motivo' },
                        ...bindingFields.slice(1, 3),
                        { key: 'started_at', label: 'Inicio corregido', type: 'datetime-local' },
                        { key: 'ended_at', label: 'Fin corregido', type: 'datetime-local' },
                      ]}
                      path={`/attentions/${editing.id}/correct`}
                      initial={{
                        ...editing,
                        started_at: localInput(editing.started_at, session.timezone),
                        ended_at: localInput(editing.ended_at, session.timezone),
                      }}
                    />
                  </section>
                )}
                <section className="panel">
                  <h2>Registro de atenciones</h2>
                  {attentionTable}
                </section>
                {canOperate && session.environment !== 'production' && (
                  <section className="panel simulator">
                    <div>
                      <span className="pill">ENTORNO DE PRUEBA</span>
                      <h2>Simulador de lector RFID</h2>
                      <p>
                        Envía una lectura al mismo flujo de estados que usará el lector físico. No acredita
                        compatibilidad de hardware.
                      </p>
                    </div>
                    <form
                      className="form-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const values = Object.fromEntries(new FormData(e.currentTarget));
                        action(async () => {
                          setScanResult(null);
                          const result = await api('/rfid/simulate', {
                            ...values,
                            event_id: crypto.randomUUID(),
                          });
                          setScanResult(result);
                          if (!result.accepted) throw new Error(result.message);
                        }, 'Lectura procesada');
                      }}
                    >
                      <SimulatorSelect
                        label="Estación"
                        name="station_id"
                        items={data.stations ?? []}
                        valueOf={(item) => item.id}
                      />
                      <SimulatorSelect
                        label="Tarjeta"
                        name="uid"
                        items={data.cards ?? []}
                        valueOf={(item) => item.uid}
                      />
                      <button className="primary" disabled={pending}>
                        Simular escaneo
                      </button>
                    </form>
                    {scanResult && (
                      <div className={'alert' + (scanResult.accepted ? '' : ' error')} role="status">
                        <strong>
                          {scanResult.code === 'CHECK_IN'
                            ? 'Entrada confirmada'
                            : scanResult.code === 'CHECK_OUT'
                              ? 'Salida confirmada'
                              : 'Lectura rechazada'}
                        </strong>
                        <p>{scanResult.message}</p>
                        {scanResult.at && <p>Hora confirmada: {stamp(scanResult.at, session.timezone)}</p>}
                        {scanResult.duration_seconds !== undefined && (
                          <p>
                            Duración: {(Number(scanResult.duration_seconds) / 60).toFixed(2)} min. Devuelve la
                            tarjeta a recepción.
                          </p>
                        )}
                        {!scanResult.accepted && (
                          <p>
                            Verifica la tarjeta y la estación con recepción. Esta lectura no ha modificado los
                            tiempos.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
            {page === 'settings' && (
              <>
                {setup && (
                  <section className="panel">
                    <h2>Configuración de la clínica</h2>
                    <p>
                      {setup.checks.filter((c: Item) => c.ready).length} de {setup.checks.length} condiciones
                      de configuración cubiertas. Confirma los servicios, precios y horarios con la clínica
                      antes de operar.
                    </p>
                    <div className="setup-grid">
                      {setup.checks.map((c: Item) => (
                        <div key={c.key}>
                          <strong>
                            {c.ready ? '✓' : '○'} {c.label}
                          </strong>
                          <small>
                            {c.count} registrados · Mínimo {c.minimum}
                          </small>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <div className="tabs settings-tabs">
                  {Object.entries(catalogConfig)
                    .filter(([key]) => key !== 'patients')
                    .map(([key, c]) => (
                      <button
                        className={category === key ? 'selected' : ''}
                        key={key}
                        onClick={() => {
                          setCategory(key);
                          setEditing(null);
                        }}
                      >
                        {c.title}
                      </button>
                    ))}
                  <button
                    className={category === 'calendar' ? 'selected' : ''}
                    onClick={() => setCategory('calendar')}
                  >
                    Calendario
                  </button>
                </div>
                {category === 'calendar' ? (
                  <section className="panel catalog-panel">
                    <form
                      className="form-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = Object.fromEntries(new FormData(e.currentTarget));
                        action(() =>
                          api('/calendar', {
                            shift_id: f.shift_id,
                            day: f.day,
                            operated: f.operated === 'true',
                            breaks:
                              f.break_start && f.break_end
                                ? [{ start: f.break_start, end: f.break_end }]
                                : [],
                          }),
                        );
                      }}
                    >
                      <div className="form-title">Días operados y descansos</div>
                      <FieldInput field={{ key: 'shift_id', label: 'Turno', options: 'shifts' }} />
                      <label>
                        Fecha
                        <input name="day" type="date" required />
                      </label>
                      <label>
                        Operado
                        <select name="operated">
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </select>
                      </label>
                      <label>
                        Inicio de descanso (opcional)
                        <input name="break_start" type="time" />
                      </label>
                      <label>
                        Fin de descanso (opcional)
                        <input name="break_end" type="time" />
                      </label>
                      <button className="primary" disabled={pending}>
                        Guardar
                      </button>
                    </form>
                    <Table
                      items={data.calendar ?? []}
                      columns={[
                        ['day', 'Fecha'],
                        ['shift_id', 'Turno ID'],
                        ['operated', 'Operado'],
                        ['breaks', 'Descansos'],
                      ]}
                    />
                  </section>
                ) : (
                  <section className="panel catalog-panel">
                    <Form
                      title={
                        editing
                          ? 'Editar ' + catalogConfig[category].title
                          : 'Agregar a ' + catalogConfig[category].title
                      }
                      fields={catalogConfig[category].fields}
                      path={'/' + category + (editing ? '/' + editing.id : '')}
                      method={editing ? 'PATCH' : 'POST'}
                      initial={editing ?? undefined}
                    />
                    <Table
                      items={data[category] ?? []}
                      columns={catalogConfig[category].columns}
                      actions={(row) => (
                        <>
                          {category !== 'cards' && (
                            <>
                              <button onClick={() => setEditing(row)}>Editar</button>
                              <button
                                onClick={() => {
                                  if (confirm('¿Cambiar disponibilidad de este registro?'))
                                    action(() =>
                                      api(`/${category}/${row.id}`, { active: !row.active }, 'PATCH'),
                                    );
                                }}
                              >
                                {row.active ? 'Inactivar' : 'Activar'}
                              </button>
                            </>
                          )}
                          {category === 'stations' && (
                            <>
                              <button
                                onClick={() => {
                                  if (confirm('¿Rotar la credencial? La anterior dejará de funcionar.'))
                                    action(async () => {
                                      const r = await api(`/stations/${row.id}/credential`, {
                                        revoke: false,
                                      });
                                      setCredential(r.token);
                                    });
                                }}
                              >
                                Credencial
                              </button>
                              <button
                                onClick={() =>
                                  action(() => api(`/stations/${row.id}/credential`, { revoke: true }))
                                }
                              >
                                Revocar
                              </button>
                            </>
                          )}
                          {category === 'cards' && row.status === 'BLOCKED' && (
                            <button
                              onClick={() => {
                                const reason = prompt('Motivo de rehabilitación y verificación física');
                                if (reason) action(() => api(`/cards/${row.id}/rehabilitate`, { reason }));
                              }}
                            >
                              Rehabilitar
                            </button>
                          )}
                        </>
                      )}
                    />
                    {credential && (
                      <div className="alert" role="status">
                        Credencial de estación (visible una vez): <code>{credential}</code>
                        <button onClick={() => setCredential('')}>Ocultar</button>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
            {page === 'security' && (
              <>
                {user.role === 'ADMIN' && (
                  <section className="panel">
                    {editing?.mode === 'user' && (
                      <Form
                        title={'Editar cuenta de ' + editing.name}
                        description="Al elegir Dentista, DentalRisk vincula o crea su perfil profesional automáticamente."
                        path={`/users/${editing.id}`}
                        method="PATCH"
                        initial={editing}
                        fields={[
                          {
                            key: 'role',
                            label: 'Rol',
                            values: [
                              ['ADMIN', 'Dueño / Administración'],
                              ['RECEPTION', 'Recepción'],
                              ['DENTIST', 'Dentista'],
                              ['SUPPORT', 'Soporte'],
                            ],
                          },
                          {
                            key: 'password',
                            label: 'Contraseña nueva (opcional, mín. 12 caracteres)',
                            type: 'password',
                            required: false,
                            autoComplete: 'new-password',
                          },
                        ]}
                      />
                    )}
                    <Form
                      title="Crear cuenta"
                      description="Selecciona el rol. Si es Dentista, el perfil profesional y su identificador se gestionan automáticamente."
                      fields={[
                        { key: 'name', label: 'Nombre', autoComplete: 'off' },
                        { key: 'email', label: 'Correo', type: 'email', autoComplete: 'off' },
                        {
                          key: 'password',
                          label: 'Contraseña temporal (mín. 12 caracteres)',
                          type: 'password',
                          autoComplete: 'new-password',
                        },
                        {
                          key: 'role',
                          label: 'Rol',
                          values: Object.entries(labels).filter(([k]) =>
                            ['ADMIN', 'RECEPTION', 'DENTIST', 'SUPPORT'].includes(k),
                          ),
                        },
                      ]}
                      path="/users"
                    />
                    <Table
                      items={data.users ?? []}
                      columns={[
                        ['name', 'Nombre'],
                        ['email', 'Correo'],
                        ['role', 'Rol'],
                        ['active', 'Activa'],
                      ]}
                      actions={(row) =>
                        row.id !== user.id ? (
                          <>
                            <button onClick={() => setEditing({ ...row, mode: 'user' })}>
                              Editar cuenta
                            </button>
                            <button
                              onClick={() =>
                                action(() => api(`/users/${row.id}`, { active: !row.active }, 'PATCH'))
                              }
                            >
                              {row.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </>
                        ) : null
                      }
                    />
                  </section>
                )}
                {user.role === 'SUPPORT' && (
                  <>
                    <section className="panel">
                      <h2>Estado del sistema</h2>
                      <p>
                        Base de datos: {diagnostics?.database ?? '—'} · Entorno: {diagnostics?.mode ?? '—'}
                      </p>
                      <p className="muted">Lector físico: pendiente de validación en clínica.</p>
                    </section>
                    <section className="panel">
                      <h2>Bitácora técnica</h2>
                      <Table
                        items={data.audit ?? []}
                        columns={[
                          ['created_at', 'Fecha'],
                          ['action', 'Operación'],
                        ]}
                      />
                    </section>
                  </>
                )}
              </>
            )}
            {page === 'account' && (
              <>
                {user.role === 'ADMIN' && (
                  <section className="panel exceptional-access">
                    <h2>Acceso excepcional a recepción</h2>
                    <p>
                      Tu cuenta está enfocada en supervisión. Si necesitas cubrir recepción, confirma tu
                      contraseña y registra el motivo. El permiso dura hasta 30 minutos y solo se aplica a
                      esta sesión.
                    </p>
                    {!operationActive && (
                      <Form
                        title="Autorizar acceso temporal"
                        path="/sessions/operation-access"
                        fields={[
                          { key: 'password', label: 'Contraseña para autorizar', type: 'password' },
                          { key: 'reason', label: 'Motivo del acceso (mínimo 5 caracteres)' },
                        ]}
                      />
                    )}
                    {operationActive && (
                      <p>
                        Acceso activo hasta {stamp(session.operation_until, session.timezone)}. Puedes
                        finalizarlo desde el aviso superior.
                      </p>
                    )}
                  </section>
                )}
                <section className="panel">
                  <h2>{user.name}</h2>
                  <p>
                    {user.email} · {labels[user.role]}
                  </p>
                  <Form
                    title="Cambiar mi contraseña"
                    path="/sessions/password"
                    fields={[
                      { key: 'current_password', label: 'Contraseña actual', type: 'password' },
                      {
                        key: 'new_password',
                        label: 'Contraseña nueva (mín. 12 caracteres)',
                        type: 'password',
                      },
                    ]}
                  />
                  <p className="muted small">
                    El cambio cerrará todas tus sesiones. Inicia nuevamente con la contraseña nueva.
                  </p>
                </section>
              </>
            )}
          </main>
          <footer>
            DentalRisk <span>Control operativo y productividad</span>
          </footer>
        </div>
      </div>
    </UiContext.Provider>
  );
}
