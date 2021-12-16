import {WalletInterface} from "./wallet-interface"
import {U64String,U128String} from "./util"
import {disconnectedWallet} from "./disconnected-wallet";

//-----------------------------
// Base smart-contract proxy class
// provides constructor, view & call methods
// derive your specific contract proxy from this class
//-----------------------------
export class SmartContract {
    
    constructor( 
        public contractId:string,
        public walletProvider: {wallet:WalletInterface}
    ){}

    view(method:string, args?:any) : Promise<any> {
        if (!this.walletProvider.wallet) throw Error(`contract-proxy not connected ${this.contractId} trying to view ${method}`)
        return this.walletProvider.wallet.view(this.contractId,method,args)
    }

    call(method:string, args:any, gas?:U64String, attachedYoctos?:U128String) : Promise<any> {
        if (!this.walletProvider.wallet) throw Error(`contract-proxy not connected ${this.contractId} trying to call ${method}`)
        return this.walletProvider.wallet.call(this.contractId, method, args, gas, attachedYoctos)
    }

    disconnect(){
        this.walletProvider.wallet = disconnectedWallet; //set to DisconnectedWallet
    }
}

