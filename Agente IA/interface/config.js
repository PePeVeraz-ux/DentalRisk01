/* Todos los registros de este prototipo son sintéticos. No contiene credenciales. */
const PROJECT_CONFIGS = {
  dental: {
    name: 'DentalRisk', agentName: 'Denti', accent: '#2563eb', soft: '#eff6ff',
    description: 'Altas de usuarios y fotos de perfil mediante el agente ESP.',
    metrics: [
      { key: 'create', label: 'Usuarios creados', icon: '+' },
      { key: 'photo', label: 'Fotos almacenadas', icon: '▧' },
      { key: 'all', label: 'Operaciones realizadas', icon: '≋' },
      { key: 'rate', label: 'Tasa de éxito', icon: '✓' }
    ],
    actions: { create: 'Crear usuario', photo: 'Guardar foto', check: 'Consultar conexión' },
    actionIcons: { create: '+', photo: '▧', check: '↗' },
    counts: [[3,2,1,0],[2,2,1,0],[4,3,1,1],[3,3,1,0],[5,3,1,0],[3,2,1,1],[4,3,1,0]],
    // Por día: altas completadas, fotos completadas, consultas completadas, errores.
    referencePrefix: 'usr', model: 'DeepSeek-V4-Pro', sourceMode: 'demo'
  },
  inventory: {
    name: 'Almacén', agentName: 'Nexo', accent: '#1d4ed8', soft: '#eaf2ff',
    description: 'Registro y seguimiento de movimientos de inventario.',
    metrics: [
      { key: 'create', label: 'Entradas registradas', icon: '+' },
      { key: 'photo', label: 'Salidas registradas', icon: '↗' },
      { key: 'all', label: 'Operaciones realizadas', icon: '≋' },
      { key: 'rate', label: 'Tasa de éxito', icon: '✓' }
    ],
    actions: { create: 'Registrar entrada', photo: 'Registrar salida', check: 'Consultar stock' },
    actionIcons: { create: '+', photo: '↗', check: '≋' },
    counts: [[5,3,2,0],[3,4,1,1],[4,3,2,0],[6,5,1,0],[4,3,1,1],[2,2,1,0],[5,4,2,0]],
    referencePrefix: 'mov', model: 'Agente de ejemplo', sourceMode: 'demo'
  }
};
