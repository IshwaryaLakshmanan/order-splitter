export const AppConfig = {
  FIXED_PRICE: Number(process.env.FIXED_PRICE ?? 100),
  SHARE_DECIMAL_PRECISION: Number(process.env.SHARE_DECIMAL_PRECISION ?? 3),
  USE_POSTGRES: process.env.USE_POSTGRES === 'true'
};
