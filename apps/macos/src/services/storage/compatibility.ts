export const legacyStorageContract = {
  databaseName: 'QualiMacDB_v7',
  stores: ['data', 'files'],
  migrationMode: 'mirror-first',
} as const

export function describeLegacyCompatibility() {
  return {
    ...legacyStorageContract,
    backupPolicy: 'Import existing backups before enabling native-only storage changes.',
  }
}
