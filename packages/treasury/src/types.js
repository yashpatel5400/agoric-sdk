// @ts-check

/**
 * @typedef  {Object} AutoswapLocal
 * @property {(amount: Amount, brand: Brand) => Amount} getInputPrice
 * @property {() => Invitation} makeSwapInvitation
 */

/**
 * @typedef {Object} Collateral
 * @property {Ratio} initialMargin
 * @property {Ratio} liquidationMargin
 * @property {Ratio} stabilityFee
 * @property {Ratio} marketPrice
 * @property {Brand} brand
 */

/**
 * @typedef {Object} Rates
 * @property {Ratio} initialMargin minimum required over-collateralization
 * required to open a loan
 * @property {Ratio} liquidationMargin margin below which collateral will be
 * liquidated to satisfy the debt.
 * @property {Ratio} initialPrice price ratio of collateral to RUN
 * @property {Ratio} interestRate - annual interest rate charged on loans
 * @property {Ratio} loanFee The fee (in BasisPoints) charged when opening
 * or increasing a loan.
 */

/**
 * @typedef  {Object} StablecoinMachine
 * @property {(collateralIssuer: Issuer, collateralKeyword: Keyword, rates: Rates) => Promise<Invitation>} makeAddTypeInvitation
 * @property {() => Instance} getAMM
 * @property {() => Promise<Array<Collateral>>} getCollaterals
 * @property {() => Allocation} getRewardAllocation,
 * @property {() => ERef<Payment>} getBootstrapPayment
 * @property {(Brand) => Governor} getContractGovernor
 * @property {() => Invitation} makeCollectFeesInvitation
 */

/**
 * @typedef {Object} UIState
 * @property {Ratio} interestRate Annual interest rate charge
 * @property {Ratio} liquidationRatio
 * @property {Amount} locked Amount of Collateral locked
 * @property {Amount} debt Amount of Loan (including accrued interest)
 * @property {Ratio} collateralizationRatio
 * @property {boolean} liquidated boolean showing whether liquidation occurred
 */

/**
 * @callback ReallocateReward
 *
 * Transfer the indicated amount to the stablecoin machine's reward
 * pool, taken from the `fromSeat`. Then reallocate over all the seat
 * arguments and the rewardPoolSeat.
 *
 * @param {Amount} amount
 * @param {ZCFSeat} fromSeat
 * @param {ZCFSeat=} otherSeat
 * @returns {void}
 */

/**
 * @typedef {Object} InnerVaultManager
 * @property {Brand} collateralBrand
 * @property {() => Ratio} getLiquidationMargin
 * @property {() => Ratio} getLoanFee
 * @property {() => Promise<PriceQuote>} getCollateralQuote
 * @property {() => Ratio} getInitialMargin
 * @property {() => Ratio} getInterestRate - The annual interest rate on a loan
 * @property {() => RelativeTime} getChargingPeriod - The period (in seconds) at
 *   which interest is charged to the loan.
 * @property {() => RelativeTime} getRecordingPeriod - The period (in seconds)
 *   at which interest is recorded to the loan.
 * @property {ReallocateReward} reallocateReward
 */

/**
 * @typedef {Object} VaultManager
 * @property {(ZCFSeat) => Promise<LoanKit>}  makeLoanKit
 * @property {() => void} liquidateAll
 * @property {() => Ratio} getLiquidationMargin
 * @property {() => Ratio} getLoanFee
 * @property {() => Promise<PriceQuote>} getCollateralQuote
 * @property {() => Ratio} getInitialMargin
 * @property {() => Ratio} getInterestRate
 */

/**
 * @typedef {Object} OpenLoanKit
 * @property {Notifier<UIState>} notifier
 * @property {Promise<PaymentPKeywordRecord>} collateralPayoutP
 */

/**
 * @typedef {Object} Vault
 * @property {() => Promise<Invitation>} makeAdjustBalancesInvitation
 * @property {() => Promise<Invitation>} makeCloseInvitation
 * @property {() => Amount} getCollateralAmount
 * @property {() => Amount} getDebtAmount
 */

/**
 * @typedef {Object} LoanKit
 * @property {Vault} vault
 * @property {Promise<PaymentPKeywordRecord>} liquidationPayout
 * @property {Notifier<UIState>} uiNotifier
 */

/**
 * @typedef {Object} VaultKit
 * @property {Vault} vault
 * @property {(ZCFSeat) => Promise<OpenLoanKit>} openLoan
 * @property {(Timestamp) => Amount} accrueInterestAndAddToPool
 */

/**
 * @typedef {Object} LoanParams
 * @property {RelativeTime} chargingPeriod
 * @property {RelativeTime} recordingPeriod
 */

/**
 * @typedef {Object} AMMFees
 * @property {bigint} poolFee
 * @property {bigint} protocolFee
 */

/**
 * @typedef {Object} LiquidationStrategy
 * @property {() => KeywordKeywordRecord} keywordMapping
 * @property {(collateral: Amount, RUN: Amount) => Proposal} makeProposal
 * @property {() => Promise<Invitation>} makeInvitation
 */

/**
 * @callback MakeVaultManager
 * @param {ContractFacet} zcf
 * @param {ERef<MultipoolAutoswapPublicFacet>} autoswap
 * @param {ZCFMint} runMint
 * @param {Brand} collateralBrand
 * @param {ERef<PriceAuthority>} priceAuthority
 * @param {GetParams} getLoanParams
 * @param {ReallocateReward} reallocateReward
 * @param {TimerService} timerService
 * @param {LiquidationStrategy} liquidationStrategy
 * @returns {VaultManager}
 */

/**
 * @callback MakeVaultKit
 * @param {ContractFacet} zcf
 * @param {InnerVaultManager} manager
 * @param {ZCFMint} runMint
 * @param {ERef<MultipoolAutoswapPublicFacet>} autoswap
 * @param {ERef<PriceAuthority>} priceAuthority
 * @param {GetParams} paramManager
 * @param {Timestamp} startTimeStamp
 * @returns {VaultKit}
 */

/**
 * @typedef {Object} DebtStatus
 * @property {Timestamp} latestInterestUpdate
 * @property {Amount} interest
 * @property {Amount} newDebt
 */

/**
 * @callback Calculate
 * @param {DebtStatus} debtStatus
 * @param {Timestamp} currentTime
 * @returns {DebtStatus}
 */

/**
 * @typedef {Object} CalculatorKit
 * @property {Calculate} calculate calculate new debt for charging periods up to
 * the present.
 * @property {Calculate} calculateReportingPeriod calculate new debt for
 * reporting periods up to the present. If some charging periods have elapsed
 * that don't constitute whole reporting periods, the time is not updated past
 * them and interest is not accumulated for them.
 */

/**
 * @callback MakeInterestCalculator
 * @param {Brand} brand
 * @param {Ratio} rate
 * @param {RelativeTime} chargingPeriod
 * @param {RelativeTime} recordingPeriod
 * @returns {CalculatorKit}
 */

/**
 * @typedef {Object} FeeParamManager
 * @property {() => Record<Keyword,ParamDescription>} getParams
 * @property {(bigint) => void} updateProtocolFee
 * @property {(bigint) => void} updatePoolFee
 */

/**
 * @typedef {Object} PoolParamManager
 * @property {() => Record<Keyword,ParamDescription>} getParams
 * @property {(bigint) => void} updateChargingPeriod
 * @property {(bigint) => void} updateRecordingPeriod
 * @property {(Ratio) => void} updateInitialMargin
 * @property {(Ratio) => void} updateLiquidationMargin
 * @property {(Ratio) => void} updateInitialPrice
 * @property {(Ratio) => void} updateInterestRate
 * @property {(Ratio) => void} updateLoanFee
 */
