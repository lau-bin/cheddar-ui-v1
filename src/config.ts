export const STNEAR_POOL_CONTRACT_NAME = 'cookie-factory-pool-stnear.hardcoder.testnet'
export const STNEAR_TOKEN_CONTRACT_NAME = 'meta-v2.pool.testnet'

export const CHEDDAR_POOL_CONTRACT_NAME = 'cookie-factory-pool-cheddar.hardcoder.testnet'
export const CHEDDAR_TOKEN_CONTRACT_NAME = 'token.cheddar.testnet'

export const NEXT_POOL_CONTRACT_NAME = 'cookie-factory-pool-meta.hardcoder.testnet'
export const NEXT_TOKEN_CONTRACT_NAME = 'token.meta.pool.testnet'

type GetConfigResult = {
  networkId:string;
  nodeUrl:string;
  keyPath?:string;
  walletUrl:string;
  helperUrl?:string;
  explorerUrl?:string;
  masterAccount?:string;
}

export function getConfig(env:string):GetConfigResult {
  switch (env) {

  case 'production':
  case 'mainnet':
    return {
      networkId: 'mainnet',
      nodeUrl: 'https://rpc.mainnet.near.org',
      walletUrl: 'https://wallet.near.org',
      helperUrl: 'https://helper.mainnet.near.org',
      explorerUrl: 'https://explorer.mainnet.near.org',
      keyPath: undefined,
      masterAccount:undefined
    }
  case 'development':
  case 'testnet':
    return {
      networkId: "testnet",
      nodeUrl: "https://rpc.testnet.near.org",
      walletUrl: "https://wallet.testnet.near.org",
      helperUrl: "https://helper.testnet.near.org",
      explorerUrl: "https://explorer.testnet.near.org",
      keyPath: undefined,
      masterAccount:undefined
    }
  case 'betanet':
    return {
      networkId: 'betanet',
      nodeUrl: 'https://rpc.betanet.near.org',
      walletUrl: 'https://wallet.betanet.near.org',
      helperUrl: 'https://helper.betanet.near.org',
      explorerUrl: 'https://explorer.betanet.near.org',
      keyPath: undefined,
      masterAccount:undefined
    }
  case 'local':
    return {
      networkId: 'local',
      nodeUrl: 'http://localhost:3030',
      keyPath: `${process.env.HOME}/.near/validator_key.json`,
      walletUrl: 'http://localhost:4000/wallet',
      helperUrl:undefined,
      masterAccount:undefined
    }
  default:
    throw Error(`Unknown environment '${env}'. Can be configured in src/config.js.`)
  }
}
