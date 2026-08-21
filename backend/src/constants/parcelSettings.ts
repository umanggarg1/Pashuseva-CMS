// Fixed business/courier account details for the Parcel Summary label — extracted from
// the store's existing parcel-summary reference document and the store logo artwork.
// Static, not admin-editable (see frontend/src/lib/parcelSettings.ts for the matching
// Dashboard-display constants; kept in sync manually since there's no shared config
// store between the two apps).
export const PARCEL_SETTINGS = {
  contractId: '41503409',
  billerId: '1679000994',
  category: 'ANIMAL HERBAL TREATMENT PRODUCTS',
  brandName: 'PASHUSEVA',
  businessName: 'AKASH ENTERPRISES KANINA',
  phones: ['9729422066', '9354874628'],
  pincode: '123027',
  state: 'HARYANA',
};
