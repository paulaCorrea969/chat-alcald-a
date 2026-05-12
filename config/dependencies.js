const DEPENDENCIES = [
  {
    id: "secretaria-general-gobierno",
    name: "Secretaria general y de gobierno",
    subdependencies: [
      { id: "inspeccion-policia", name: "Inspeccion de policia" },
      { id: "comisaria-familia", name: "Comisaria de familia" },
      { id: "victimas-poblacion-vulnerable", name: "Victimas y poblacion vulnerable" },
      { id: "contratacion", name: "Contratacion" },
    ],
  },
  {
    id: "hacienda-credito-publico",
    name: "Hacienda y credito publico",
    subdependencies: [
      { id: "tesoreria", name: "Tesoreria" },
      { id: "recaudo", name: "Recaudo" },
      { id: "hacienda", name: "Hacienda" },
      { id: "presupuesto", name: "Presupuesto" },
    ],
  },
  {
    id: "direccion-local-salud",
    name: "Direccion local de salud",
    subdependencies: [
      { id: "direccion-local-salud", name: "Direccion local de salud" },
    ],
  },
  {
    id: "planeacion-desarrollo-economico",
    name: "Planeacion y desarrollo economico",
    subdependencies: [
      { id: "planeacion", name: "Planeacion" },
      { id: "sisben-umata", name: "Sisben Umata" },
    ],
  },
  {
    id: "despacho-alcalde",
    name: "Despacho alcalde",
    subdependencies: [
      { id: "despacho-alcalde", name: "Despacho alcalde" },
    ],
  },
  {
    id: "secretaria-desarrollo-social",
    name: "Secretaria de desarrollo social",
    subdependencies: [
      { id: "biblioteca", name: "Biblioteca" },
      { id: "ludoteca", name: "Ludoteca" },
      { id: "desarrollo-social", name: "Desarrollo social" },
      { id: "desarrollo-comunitario", name: "Desarrollo comunitario" },
    ],
  },
  {
    id: "control-interno",
    name: "Control interno",
    subdependencies: [
      { id: "control-interno", name: "Control interno" },
    ],
  },
  {
    id: "infraestructura",
    name: "Infraestructura",
    subdependencies: [
      { id: "alumbrado-publico", name: "Alumbrado publico" },
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
