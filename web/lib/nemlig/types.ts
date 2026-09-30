export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
};

export type Session = {
  savedAt: string;
  cookies: StoredCookie[];
};

// Kun produktdata gemmes. Leveringsadresse, navn, telefon m.m. fra nemlig's
// svar smides væk i orders.ts, før noget skrives til disk.
export type OrderLine = {
  productId: string;
  name: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  originalAmount: number;
  group: string;
  mainGroup: string;
  imageUrl: string | null;
  productUrl: string | null;
  campaignName: string | null;
};

export type Order = {
  id: number;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  status: number;
  subTotal: number;
  lines: OrderLine[];
};

export type OrderCache = {
  syncedAt: string;
  orders: Order[];
};
