// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

/**
 * @template {string} H - the name of the handle
 * @typedef {H & {}} Handle A type constructor for an opaque type
 * identified by the H string. This uses an intersection type
 * ('MyHandle' & {}) to tag the handle's type even though the actual
 * value is just an empty object.
 */

/**
 * @typedef {string} Keyword
 * @typedef {Handle<'Invitation'>} InvitationHandle - an opaque handle for an invitation
 * @typedef {Record<Keyword,Issuer>} IssuerKeywordRecord
 * @typedef {Record<Keyword,ERef<Issuer>>} IssuerPKeywordRecord
 * @typedef {Record<Keyword,Brand>} BrandKeywordRecord
 */

/**
 * @typedef {Object} StandardTerms
 * @property {IssuerKeywordRecord} issuers - record with
 * keywords keys, issuer values
 * @property {BrandKeywordRecord} brands - record with keywords
 * keys, brand values
 *
 * @typedef {StandardTerms & Record<string, any>} Terms
 *
 * @typedef {object} InstanceRecord
 * @property {Installation} installation
 * @property {Instance} instance
 * @property {Terms} terms - contract parameters
 
 *
 * @typedef {Object} IssuerRecord
 * @property {Brand} brand
 * @property {Issuer} issuer
 * @property {AssetKind} assetKind
 * @property {any} [displayInfo]
 *
 * @typedef {AmountKeywordRecord} Allocation
 * @typedef {Record<Keyword,AmountMath>} AmountMathKeywordRecord
 */

/**
 * @typedef {Payment} Invitation
 */

/**
 * @typedef {Object} ZoeServiceWFeePurseApplied
 *
 * See ZoeService for comments.
 *
 * @property {() => Issuer} getInvitationIssuer
 *
 * @property {InstallWFeePurseApplied} install
 * @property {StartInstanceWFeePurseApplied} startInstance
 * @property {OfferWFeePurseApplied} offer
 * @property {GetPublicFacetWFeePurseApplied} getPublicFacet
 *
 * @property {GetIssuers} getIssuers
 * @property {GetBrands} getBrands
 * @property {GetTerms} getTerms
 * @property {GetInstallationForInstance} getInstallationForInstance
 * @property {GetInstance} getInstance
 * @property {GetInstallation} getInstallation
 * @property {GetInvitationDetails} getInvitationDetails - return an
 * object with the instance, installation, description, invitation
 * handle, and any custom properties specific to the contract.
 * @property {GetFeeIssuer} getFeeIssuer
 * @property {MakeFeePurse} makeFeePurse
 */

/**
 * @callback GetPublicFacetWFeePurseApplied
 *
 * See GetPublicFacet for comments.
 *
 * @param {Instance} instance
 * @returns {Object}
 */

/**
 * @callback InstallWFeePurseApplied
 *
 * See Install for comments.
 *
 * @param {SourceBundle} bundle
 * @returns {Installation}
 */

/**
 * @callback StartInstanceWFeePurseApplied
 *
 * See StartInstance for comments.
 *
 * @param {ERef<Installation>} installation
 * @param {IssuerKeywordRecord=} issuerKeywordRecord
 * @param {Object=} terms
 * @param {Object=} privateArgs - an optional configuration object
 * that can be used to pass in arguments that should not be in the
 * public terms
 * @returns {Promise<StartInstanceResult>}
 */

/**
 * @callback OfferWFeePurseApplied
 *
 * See Offer for comments.
 *
 * @param {ERef<FeePurse>} feePurse
 * @param {ERef<Invitation>} invitation
 * @param {Proposal=} proposal
 * @param {PaymentPKeywordRecord=} paymentKeywordRecord
 * @returns {Promise<UserSeat>} seat
 */
