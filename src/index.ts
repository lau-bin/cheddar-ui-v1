import { connect, Contract, keyStores, Near, WalletConnection } from 'near-api-js'
import { CHEDDAR_POOL_CONTRACT_NAME, CHEDDAR_TOKEN_CONTRACT_NAME, getConfig, NEXT_POOL_CONTRACT_NAME, NEXT_TOKEN_CONTRACT_NAME, STNEAR_POOL_CONTRACT_NAME, STNEAR_TOKEN_CONTRACT_NAME } from './config'
import { WalletInterface } from './wallet-api/wallet-interface';
import { disconnectedWallet } from './wallet-api/disconnected-wallet';
import { NearWebWallet } from './wallet-api/near-web-wallet/near-web-wallet';
import { narwallets, addNarwalletsListeners } from './wallet-api/narwallets/narwallets';
import { toNumber, ntoy, yton, toStringDec, toStringDecLong, toStringDecMin, ytonFull, addCommas, convertToDecimals, removeDecZeroes, convertToBase } from './util/conversions';
import { StakingPoolP1 } from './contracts/p2-staking';
import { ContractParams, defaultContractData, TokenData, TokenParams } from './contracts/contract-structs';
//qs/qsa are shortcut for document.querySelector/All
import { qs, qsa, qsi, showWait, hideWaitKeepOverlay, showErr, showSuccess, showMessage, show, hide, hidePopup, hideOverlay, qsaInnerText, showError, showPopup } from './util/document';
import { checkRedirectSearchParams } from './wallet-api/near-web-wallet/checkRedirectSearchParams';
import { computeCurrentEpoch, EpochInfo } from './util/near-epoch';
import { NEP141Trait, FungibleTokenMetadata } from './contracts/NEP141';
import { InvalidSignature } from 'near-api-js/lib/generated/rpc_error_types';
import { isDefined } from "./util/guards"

const NETWORK = "testnet"
//default testnet, can change according to URL on window.onload
let nearConfig = getConfig(NETWORK);

// global variables used throughout
let walletProvider: {wallet:WalletInterface} = {
  wallet: disconnectedWallet
}
let nearWebWalletConnection: WalletConnection;
enum tokenTypes {
  stNear = "stNear",
  cheddar = "cheddar",
  next = "next"
}
let tokens: { [key in keyof typeof tokenTypes]: TokenData } = {
  stNear: {
    ...defaultContractData(),
    contract: new StakingPoolP1(STNEAR_POOL_CONTRACT_NAME, walletProvider),
    tokenContractName: new NEP141Trait(STNEAR_TOKEN_CONTRACT_NAME, walletProvider)
  },
  cheddar: {
    ...defaultContractData(),
    contract: new StakingPoolP1(CHEDDAR_POOL_CONTRACT_NAME, walletProvider),
    tokenContractName: new NEP141Trait(CHEDDAR_TOKEN_CONTRACT_NAME, walletProvider)
  },
  next: {
    ...defaultContractData(),
    contract: new StakingPoolP1(NEXT_POOL_CONTRACT_NAME, walletProvider),
    tokenContractName: new NEP141Trait(NEXT_TOKEN_CONTRACT_NAME, walletProvider)
  }
}

//time in ms
const SECONDS = 1000
const MINUTES = 60 * SECONDS
const HOURS = 60 * MINUTES
const ONE_NEAR = BigInt(10) ** BigInt(24);

//------------------------------
//--- connect buttons->code ----
//------------------------------
function uiInit() {
  //all popup "cancel" buttons
  qsa('.popup button#cancel').forEach(f => (f as HTMLButtonElement).onclick = (event) => { event.preventDefault(); hideOverlay() })

  //connect wallet selection boxes
  qs('#near-web-wallet-box').onclick = loginNearWebWallet
  qs('#narwallets-wallet-box').onclick = loginNarwallets

  //nav my-account "home"
  qs('nav #home').onclick =
    async function (event) {
      event.preventDefault()
      if (walletProvider.wallet.isConnected()) {
        signedInFlow()
      }
      else {
        signedOutFlow();
      }
    }
  qs('nav #my-account').onclick = navClickHandler_ConnectFirst
  qs('#logo').onclick =
    async function (event) {
      event.preventDefault()
      if (walletProvider.wallet.isConnected()) {
        signedInFlow()
      }
      else {
        signedOutFlow();
      }
    }

  //generic nav handler
  function navClickHandler_ConnectFirst(event: Event) {
    event.preventDefault()
    if (walletProvider.wallet.isConnected()) {
      //show section with same id as the <anchor> link
      showSection("#" + (event.target as HTMLElement).closest("a")?.id)
    }
    else {
      showSection("#home")
      sayChoose()
    }
  }

  qs('nav #faq').onclick = () => { showSection("#faq") }

  function sayChoose() {
    showMessage("Please choose a wallet to connect", "Connect first");
  }

  //button sign-out
  qs('#sign-out').onclick =
    async function (event) {
      event.preventDefault()
      walletProvider.wallet.disconnect();
      walletProvider.wallet = disconnectedWallet;
      signedOutFlow();
    }
  // stake
  for (const token in tokenTypes) {
    for (const action of ["stake", "unstake"]) {
      qs('button#' + action + token).onclick =
        async function (event: Event) {
          event.preventDefault()
          var buttonId = 'button#' + (event.target as HTMLElement).id
          var button = qs(buttonId) as HTMLButtonElement

          submitForm(token as tokenTypes, button.form!, action, tokens[(token as keyof typeof tokenTypes)])
        }
    }
  }

  for (const token in tokenTypes) {
    qs(`#${token} button.activate`).onclick =
      async function (event) {
        event.preventDefault()
        qs(`#${token} #deposit`).style.display = "none";
        qs(`#${token} #activated`).style.display = "block";
        let tokenCtr = tokens[(token as keyof typeof tokenTypes)]
        await tokenCtr.contract.storageDeposit();
      }

    qs(`#${token} a#terms-of-use`).onclick =
      async function (event) {
        event.preventDefault()
        showPopup("#terms.popup")
      }

    qs(`#${token} #wallet-available a .max`).onclick =
      async function (event) {
        try {
          event.preventDefault()
          let tokenCtr = tokens[(token as keyof typeof tokenTypes)]
          var amountAvailable = convertToDecimals(await tokenCtr.tokenContractName!.ft_balance_of(walletProvider.wallet.getAccountId()), tokenCtr.metaData!.decimals)
          qsi(`#${token} #stakeAmount`).value = parseInt(amountAvailable.replace(",", "")).toString()
        }
        catch (ex) {
          showErr(ex)
        }
      }

    qs(`#${token} #near-balance a .max`).onclick =
      async function (event) {
        try {
          event.preventDefault()
          let tokenCtr = tokens[(token as keyof typeof tokenTypes)]
          qsi(`#${token} #stakeAmount`).value = convertToDecimals(tokenCtr.accountInfo, tokenCtr.metaData!.decimals).toString()
        }
        catch (ex) {
          showErr(ex)
        }
      }

  }
}
uiInit()

//Form submission
//qs('form#stake/unstake').onsubmit =
async function submitForm(tokenName: tokenTypes, form: HTMLFormElement, action: string, token: TokenData) {
  if (!isDefined(token.metaData) || !isDefined(token.tokenContractName) || !isDefined(token.contract) || !isDefined(token.totalStakedLocal)) {
    showErr("Contracts loading")
    return
  }
  //const form = event.target as HTMLFormElement
  // get elements from the form using their id attribute
  const { fieldset, stakeAmount } = form

  // disable the form while the call is made
  fieldset.disabled = true
  const isStaking = action == "stake"
  showWait(isStaking ? "Staking..." : "Unstaking...")

  try {

    if (!token.contractParams.is_active) throw Error("pools are not open yet")

    //get amount
    const min_deposit_amount = 1;
    let amount: bigint = BigInt(stakeAmount.value)

    if (isStaking) {
      // make a call to the smart contract
      if (amount < min_deposit_amount) throw Error(`Stake at least ${min_deposit_amount} ${token.metaData.name}`);
      await token.tokenContractName.ft_transfer_call(token.contract.contractId, convertToBase(stakeAmount.value, token.metaData.decimals), "to pool")
      token.totalStakedLocal += amount
    }
    else {

      if (amount <= 0) throw Error(`Unstake a positive amount`);

      await token.contract.unstake(convertToBase(stakeAmount.value, token.metaData.decimals))
      token.totalStakedLocal -= amount
    }

    //clear form
    form.reset()
    //refresh acc info
    await refreshAccountInfo()
    showSuccess((isStaking ? "Staked " : "Unstaked ") + toStringDecMin(Number.parseInt(amount.toString())))
  }
  catch (ex) {
    showErr(ex)
  }

  // re-enable the form, whether the call succeeded or failed
  fieldset.disabled = false
}

function showUnstakeResult(unstaked: number) {
  showSuccess(
    `<div class="stat-line"> <dt>Unstaked</dt><dd>${toStringDec(unstaked)}</dd> </div>`
    , "Unstake"
  )
}

//--------------------------------------
// AutoRefresh
async function autoRefresh() {
  //console.log("autoRefresh")
  if (walletProvider && walletProvider.wallet.isConnected()) {
    try {
      await refreshAccountInfo()
    }
    catch (ex) {
      //console.log("auto-refresh: " + ex.message)
    }
  }
  setTimeout(autoRefresh, 10 * MINUTES)
  //console.log("auto-refresh")
}

//--------------------------------------
function showSection(selector: string) {
  //hide all sections
  qsa("main section").forEach(hide);
  //show section
  const section = qs("main").querySelector(selector)
  if (section) {
    show(section)
    selectNav(selector);
  }
}
function selectNav(selector: string) {
  //nav
  const allNav = qsa("nav a");
  allNav.forEach(e => (e as HTMLElement).classList.remove("selected"))
  qs("nav").querySelector(selector)?.classList.add("selected")
}

// Display the signed-out-flow container
async function signedOutFlow() {
  showSection("#home")
  await refreshAccountInfo();
}

// Displaying the signed in flow container and fill in account-specific data
async function signedInFlow() {
  showSection("#home-connected")
  selectNav("#home")
  await refreshAccountInfo()
}

// Initialize contract & set global variables
async function initNearWebWalletConnection() {
  // Initialize connection to the NEAR testnet
  const near = await connect(Object.assign({ deps: { keyStore: new keyStores.BrowserLocalStorageKeyStore() } }, nearConfig))
  nearWebWalletConnection = new WalletConnection(near, null)
}

function logoutNearWebWallet() {

  nearWebWalletConnection.signOut()
  walletProvider.wallet = disconnectedWallet
  // reload page
  window.location.replace(window.location.origin + window.location.pathname)
}

function loginNearWebWallet() {
  // Allow the current app to make calls to the specified contract on the user's behalf.
  // This works by creating a new access key for the user's account and storing
  // the private key in localStorage.
  //save what the user typed before navigating out
  nearWebWalletConnection.requestSignIn()
}

function loginNarwallets() {
  //login is initiated from the chrome-extension
  //show step-by-step instructions
  window.open("http://www.narwallets.com/help/connect-to-web-app")
}

async function refreshAccountInfo() {
  try {

    let accName = walletProvider.wallet.getAccountId();

    if (accName.length > 22) accName = accName.slice(0, 10) + ".." + accName.slice(-10);

    qs(".user-info #account-id").innerText = accName;
    //update account & contract stats
    if (walletProvider.wallet.isConnected()) {

      for (const token in tokenTypes) {
        let tokenCtr = tokens[(token as keyof typeof tokenTypes)]
        let balance = await tokenCtr.tokenContractName.ft_balance_of(accName);
        let metaData = await tokenCtr.tokenContractName.ft_metadata();
        let walletAvailable = toStringDec(Number.parseFloat(convertToDecimals(balance, metaData.decimals)))
        //update shown wallet balance
        qsaInnerText(`#${token} #wallet-available span.near.balance`, removeDecZeroes(walletAvailable));

        if (Number(walletAvailable.replace(",", "")) > 1) {
          qs(`#${token} #wallet-available a .max`).style.display = "block";
        }


        let accountRegistred = await tokenCtr.contract.view("storage_balance_of", { account_id: walletProvider.wallet.getAccountId() })

        if (accountRegistred == null) {
          qs(`#${token} #deposit`).style.display = "block"
          qs(`#${token} #activated`).style.display = "none"
        }
        else {
          qs(`#${token} #deposit`).style.display = "none"
          qs(`#${token} #activated`).style.display = "block"
        }

        var tokenNames = qsa(`#${token} .token-name`) as NodeListOf<HTMLElement>;
        tokenNames.forEach.call(tokenNames, function (el) {
          el.innerText = metaData.symbol.toUpperCase();
        });
        let accountInfo = await tokenCtr.contract.status(accName)
        let contractParams = await tokenCtr.contract.get_contract_params()
        var iconObj = qs(`#${token} #token-header img`) as HTMLImageElement;
        var iconVal = metaData.icon;

        if (iconObj != null) {

          if (iconVal != null && iconVal.includes("data:image/svg+xml")) {
            iconObj.src = metaData.icon || "";
          } else {
            var iconImage = document.createElement('span');
            iconImage.classList.add('icon');
            iconImage.innerHTML = metaData.icon || "";
            iconObj.parentNode?.replaceChild(iconImage, iconObj);
          }
        }

        qs(`#${token} #token-header span.name`).innerText = metaData.name;
        qs(`#${token}-pool-stats #total-staked`).innerText = convertToDecimals(contractParams.total_staked, metaData.decimals, 5) + " " + metaData.symbol.toUpperCase()

        // update token data
        tokenCtr.metaData = metaData
        tokenCtr.contractParams = contractParams
        tokenCtr.accountInfo = accountInfo
        tokenCtr.totalStakedLocal = BigInt(contractParams.total_staked)
      }
    }
    else {
      for (const token in tokenTypes) {
        let tokenCtr = tokens[(token as keyof typeof tokenTypes)]

        tokenCtr.accountInfo = "0";
        tokenCtr.totalStakedLocal = BigInt(0);
      }

    }
    for (const token in tokenTypes) {
      let tokenCtr = tokens[(token as keyof typeof tokenTypes)]
      let staked = BigInt(tokenCtr.accountInfo);
  
      if (staked > 0) {
        qs(`#${token} #near-balance a .max`).style.display = "block";
      }
      if (isDefined(tokenCtr.metaData)){
        qsaInnerText(`#${token} #near-balance span.near.balance`, convertToDecimals(tokenCtr.accountInfo, tokenCtr.metaData.decimals, 2))
      }
    }
  }
  catch (ex) {
    showErr(ex)
  }
}

/// when the user chooses "connect to web-page" in the narwallets-chrome-extension
function narwalletConnected(ev: CustomEvent) {
  walletProvider.wallet = narwallets;
  signedInFlow()
}

/// when the user chooses "disconnect from web-page" in the narwallets-chrome-extension
function narwalletDisconnected(ev: CustomEvent) {
  walletProvider.wallet = disconnectedWallet;
  signedOutFlow()
}

window.onload = async function () {
  signedOutFlow()
  try {

    let env = NETWORK
    //change to mainnet if url contains /DApp/mainnet/
    //get from url: DApp/testnet/ or DApp/mainnet/
    const parts = window.location.pathname.split("/")
    const i = parts.indexOf("DApp")
    if (i >= 0) { env = parts[i + 1] }
    if (env !== nearConfig.networkId){
      nearConfig = getConfig(env);
    }

    var countDownDate = new Date("Dec 23, 2021 00:00:00 UTC");
    var countDownDate = new Date(countDownDate.getTime() - countDownDate.getTimezoneOffset() * 60000)

    var x = setInterval(function () {

      // Get today's date and time
      var d = new Date();
      var d = new Date(d.getTime() - d.getTimezoneOffset() * 60000)

      // Find the distance between now and the count down date
      var distance = countDownDate.getTime() - d.getTime();

      // Time calculations for days, hours, minutes and seconds
      var days = Math.floor(distance / (1000 * 60 * 60 * 24));
      var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      var seconds = Math.floor((distance % (1000 * 60)) / 1000);

      // Display the result in the element with id="demo"
      (document.getElementById("timer") as HTMLElement).innerHTML = "<h2><span style='color:#222'>Starts In: </span><span style='color:rgba(80,41,254,0.88)'>" + days + "d : " + hours + "h : "
        + minutes + "m : " + seconds + "s" + "</span></h2>";

      // If the count down is finished, write some text
      if (distance < 0) {
        clearInterval(x);
        (document.getElementById("timer") as HTMLElement).innerHTML = "<h2 style='color:rgba(80,41,254,0.88)'>FARM IS LIVE!</h2>";
      }
    }, 1000);


    //console.log(nearConfig.farms[0].networkId)

    //init narwallets listeners
    //tell the wallet which network we want to operate on
    narwallets.setNetwork(nearConfig.networkId); 
    //listen to narwallets events
    addNarwalletsListeners(narwalletConnected, narwalletDisconnected) 
    //check if signed-in with NEAR Web Wallet
    await initNearWebWalletConnection()

    if (nearWebWalletConnection.isSignedIn()) {

      //already signed-in with NEAR Web Wallet
      //make the contract use NEAR Web Wallet
      walletProvider.wallet = new NearWebWallet(nearWebWalletConnection);
      await signedInFlow()
      //set-up auto-refresh loop (10 min)
      autoRefresh()
      //check if we're re-spawning after a wallet-redirect
      //show transaction result depending on method called
      const { err, data, method, finalExecutionOutcome } = await checkRedirectSearchParams(nearWebWalletConnection, nearConfig.explorerUrl || "explorer");

      if (finalExecutionOutcome)
        var args = JSON.parse(atob(finalExecutionOutcome.transaction.actions[0].FunctionCall.args))

      if (err) {
        showError(err, "Transaction - " + method || "");
      }
      else if (method == "deposit_and_stake") {
        showSuccess("Deposit Successful")
      }

      if (method == "unstake" && data == null) {
        showSuccess("Unstaked All")
      }
      else if (method == "unstake" && args.amount != null) {
        //console.log("unstake")
        var receiver = finalExecutionOutcome?.transaction.receiver_id;
        if (receiver) {
          switch (receiver) {
            case STNEAR_POOL_CONTRACT_NAME: {
              showSuccess(`Unstaked ${convertToDecimals(args.amount, tokens.stNear.metaData!.decimals, 2)} ${tokens.stNear.metaData!.symbol}`)
              break;
            }
            case CHEDDAR_POOL_CONTRACT_NAME: {
              showSuccess(`Untaked ${convertToDecimals(args.amount, tokens.cheddar.metaData!.decimals, 2)} ${tokens.cheddar.metaData!.symbol}`)
              break;
            }
            case NEXT_POOL_CONTRACT_NAME: {
              showSuccess(`Untaked ${convertToDecimals(args.amount, tokens.next.metaData!.decimals, 2)} ${tokens.next.metaData!.symbol}`)
              break;
            }
          }
        }
      }
      else if (data) {
        switch (method) {
          case "unstake": {
            var receiver = finalExecutionOutcome?.transaction.receiver_id;
            if (receiver) {
              switch (receiver) {
                case STNEAR_POOL_CONTRACT_NAME: {
                  showSuccess(`Unstaked ${convertToDecimals(data, tokens.stNear.metaData!.decimals, 2)} ${tokens.stNear.metaData!.symbol}`)
                  break;
                }
                case CHEDDAR_POOL_CONTRACT_NAME: {
                  showSuccess(`Untaked ${convertToDecimals(data, tokens.cheddar.metaData!.decimals, 2)} ${tokens.cheddar.metaData!.symbol}`)
                  break;
                }
                case NEXT_POOL_CONTRACT_NAME: {
                  showSuccess(`Untaked ${convertToDecimals(data, tokens.next.metaData!.decimals, 2)} ${tokens.next.metaData!.symbol}`)
                  break;
                }
              }
            }
            break;
          }
          case "ft_transfer_call": {
            var receiver = finalExecutionOutcome?.transaction.receiver_id;
            if (receiver) {
              switch (receiver) {
                case STNEAR_POOL_CONTRACT_NAME: {
                  showSuccess(`Unstaked ${convertToDecimals(data, tokens.stNear.metaData!.decimals, 2)} ${tokens.stNear.metaData!.symbol}`)
                  break;
                }
                case CHEDDAR_POOL_CONTRACT_NAME: {
                  showSuccess(`Untaked ${convertToDecimals(data, tokens.cheddar.metaData!.decimals, 2)} ${tokens.cheddar.metaData!.symbol}`)
                  break;
                }
                case NEXT_POOL_CONTRACT_NAME: {
                  showSuccess(`Untaked ${convertToDecimals(data, tokens.next.metaData!.decimals, 2)} ${tokens.next.metaData!.symbol}`)
                  break;
                }
              }
            }
            break;
          }
          default:
            showSuccess(data[0], "Transaction Result")
        }
      }

    }
    else {
      //not signed-in 
      await signedOutFlow() //show home-not-connected -> select wallet page
    }
  }
  catch (ex) {
    showErr(ex)
  }
}
