export type Role = 'ADMIN' | 'RECEPTION' | 'DENTIST' | 'SUPPORT';
export const workspaceRoles = {
  ADMIN: {
    title: 'Dirección de la clínica',
    home: 'dashboard',
    intro: 'Indicadores para decidir, comparar y acompañar a tu equipo.',
  },
  RECEPTION: {
    title: 'Recepción',
    home: 'reception',
    intro: 'Pacientes, agenda y tarjetas para coordinar la jornada.',
  },
  DENTIST: {
    title: 'Mi espacio clínico',
    home: 'dashboard',
    intro: 'Tu agenda, tus atenciones y tu productividad.',
  },
  SUPPORT: {
    title: 'Soporte técnico',
    home: 'security',
    intro: 'Diagnóstico del sistema y seguimiento técnico.',
  },
} as const;
export const modules: {
  id: string;
  path: string;
  label: string;
  icon: string;
  roles: Role[];
  operational?: boolean;
}[] = [
  { id: 'dashboard', path: '/direccion', label: 'Panel ejecutivo', icon: '◫', roles: ['ADMIN', 'DENTIST'] },
  { id: 'team', path: '/equipo', label: 'Equipo y desempeño', icon: '◉', roles: ['ADMIN'] },
  {
    id: 'reception',
    path: '/recepcion',
    label: 'Recepción',
    icon: '▦',
    roles: ['RECEPTION'],
    operational: true,
  },
  {
    id: 'appointments',
    path: '/agenda',
    label: 'Agenda',
    icon: '□',
    roles: ['RECEPTION', 'DENTIST'],
    operational: true,
  },
  {
    id: 'attentions',
    path: '/atenciones',
    label: 'Atenciones',
    icon: '◷',
    roles: ['ADMIN', 'RECEPTION', 'DENTIST'],
  },
  { id: 'reports', path: '/reportes', label: 'Reportes', icon: '▤', roles: ['ADMIN', 'DENTIST'] },
  { id: 'settings', path: '/configuracion', label: 'Configuración', icon: '⚙', roles: ['ADMIN'] },
  {
    id: 'security',
    path: '/seguridad',
    label: 'Usuarios y seguridad',
    icon: '◇',
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    id: 'account',
    path: '/mi-cuenta',
    label: 'Mi cuenta',
    icon: '○',
    roles: ['ADMIN', 'RECEPTION', 'DENTIST', 'SUPPORT'],
  },
];
