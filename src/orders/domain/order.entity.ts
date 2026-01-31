export interface SplitOrder {
  symbol: string;
  amount: number;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;  
  portfolioName: string; 
  orderType: 'BUY' | 'SELL';
  status: 'Created' | 'Executed' | 'Cancelled';
  executionDate: string;
  orders: SplitOrder[];
  createdAt: string;
}
