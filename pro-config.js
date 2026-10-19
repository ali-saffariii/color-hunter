/* Color Hunter Pro — build configuration.
 *
 * This file is the only place the Pro tier is configured. It ships with nothing
 * set, which means exactly this: Free works fully, Pro cannot be bought and no
 * license can be activated, and the app says so honestly.
 *
 * To open sales later (all of this needs infrastructure that does not live in this
 * repository — a payment provider and a small server that issues license keys):
 *   1. node tools/license.js keygen   -> prints a public key and writes a private key
 *      (keep the private key out of the repository; .gitignore already excludes it).
 *   2. Put the PUBLIC key in `publicKey` below.
 *   3. Put your hosted checkout page address (https only) in `checkoutUrl`.
 *   4. After a purchase, issue a key with `node tools/license.js issue ...` (or the same
 *      logic on your server) and send it to the buyer, who pastes it into Pro > Activate.
 */
window.CH_PRO_CONFIG = {
  productName: 'Color Hunter Pro',
  publicKey: null,
  checkoutUrl: '',
  priceLabel: ''
};
