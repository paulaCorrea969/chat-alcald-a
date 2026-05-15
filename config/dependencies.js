const DEPENDENCIES = [
  {
    id: "secretaria-general-gobierno",
    name: "Secretaria general y de gobierno",
    subdependencies: [
      { id: "inspeccion-policia", name: "Inspeccion de Policía" },
      { id: "comisaria-familia", name: "Comisaria de Familia" },
      { id: "victimas-poblacion-vulnerable", name: "Victimas y Población Vulnerable" },
      { id: "contratacion", name: "Contratación" },
    ],
  },
  {
    id: "hacienda-credito-publico",
    name: "Hacienda y Crédito Público",
    subdependencies: [
      { id: "tesoreria", name: "Tesorería" },
      { id: "recaudo", name: "Recaudo" },
      { id: "hacienda", name: "Hacienda" },
      { id: "presupuesto", name: "Presupuesto" },
    ],
  },
  {
    id: "direccion-local-salud",
    name: "Dirección Local de Salud",
    subdependencies: [
      { id: "direccion-local-salud", name: "Dirección Local de Salud" },
    ],
  },
  {
    id: "planeacion-desarrollo-economico",
    name: "Planeación y Desarrollo Económico",
    subdependencies: [
      { id: "planeacion", name: "Planeación" },
      { id: "sisben-umata", name: "Sisbén" },
      { id: "umata", name: "UMATA" },
    ],
  },
  {
    id: "despacho-alcalde",
    name: "Despacho Alcalde",
    subdependencies: [
      { id: "despacho-alcalde", name: "Despacho Alcalde" },
    ],
  },
  {
    id: "secretaria-desarrollo-social",
    name: "Secretaria de Desarrollo Social",
    subdependencies: [
      { id: "biblioteca", name: "Biblioteca" },
      { id: "ludoteca", name: "Ludoteca" },
      { id: "desarrollo-social", name: "Desarrollo Social" },
      { id: "desarrollo-comunitario", name: "Desarrollo Comunitario" },
    ],
  },
  {
    id: "control-interno",
    name: "Control Interno",
    subdependencies: [
      { id: "control-interno", name: "Control Interno" },
    ],
  },
  {
    id: "infraestructura",
    name: "Infraestructura",
    subdependencies: [
      { id: "alumbrado-publico", name: "Alumbrado Público" },
      { id: "infraestructura", name: "Infraestructura" },
    ],
  },
];

function findDependency(dependencyId) {
  return DEPENDENCIES.find((dependency) => dependency.id === dependencyId) || null;
}

function findSubdependency(dependencyId, subdependencyId) {
  const dependency = findDependency(dependencyId);

  if (!dependency) {
    return null;
  }

  return (
    dependency.subdependencies.find(
      (subdependency) => subdependency.id === subdependencyId
    ) || null
  );
}

function buildRoomId(dependencyId, subdependencyId) {
  return `${dependencyId}__${subdependencyId}`;
}

function resolveRoom(dependencyId, subdependencyId) {
  const dependency = findDependency(dependencyId);
  const subdependency = findSubdependency(dependencyId, subdependencyId);

  if (!dependency || !subdependency) {
    return null;
  }

  return {
    dependencyId,
    dependencyName: dependency.name,
    subdependencyId,
    subdependencyName: subdependency.name,
    roomId: buildRoomId(dependencyId, subdependencyId),
    roomLabel: `${dependency.name} / ${subdependency.name}`,
  };
}

function resolveRoomByRoomId(roomId) {
  const normalizedRoomId = String(roomId || "").trim();

  for (const dependency of DEPENDENCIES) {
    for (const subdependency of dependency.subdependencies) {
      const room = resolveRoom(dependency.id, subdependency.id);

      if (room && room.roomId === normalizedRoomId) {
        return room;
      }
    }
  }

  return null;
}

module.exports = {
  DEPENDENCIES,
  findDependency,
  findSubdependency,
  buildRoomId,
  resolveRoom,
  resolveRoomByRoomId,
};
