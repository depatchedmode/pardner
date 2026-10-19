export const replicaOptions = { replicaCredentialId: 'test-replica', replicaToken: 'test-replica-secret' }
export const replicaCredentials = { [replicaOptions.replicaCredentialId]: replicaOptions.replicaToken }
export const replicaEnvironment = {
  PARDNER_REPLICA_ID: replicaOptions.replicaCredentialId,
  PARDNER_REPLICA_TOKEN: replicaOptions.replicaToken,
  PARDNER_REPLICA_CREDENTIALS: JSON.stringify(replicaCredentials),
}
