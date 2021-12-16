import { FungibleTokenMetadata, NEP141Trait } from "./NEP141";
import { StakingPoolP1 } from "./p2-staking";

type U128String = string;


//JSON compatible struct returned from get_contract_state
export interface ContractParams {
    owner_id: string,
    token_contract: string,
    is_active: boolean,
    total_staked: string, //yoctoNEAR
    closing_date: string
}
export type TokenData = {
    contract: StakingPoolP1,
    tokenContractName: NEP141Trait,
    accountInfo: string,
    contractParams: ContractParams,
    metaData?: FungibleTokenMetadata,
    totalStakedLocal?: bigint
}
export function defaultContractData(){
    return {
        accountInfo: "",
        contractParams: {
            owner_id: "",
            token_contract: "",
            is_active: false,
            closing_date: "",
            total_staked: "0"
        }
    }

}

export type TokenParams = {
    decimals: string,
    icon: string,
    name: string,
    reference: string,
    reference_hash: string,
    spec: string,
    symbol: string,
}


