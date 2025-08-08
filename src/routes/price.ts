import { Hono } from 'hono';
import { getEthereumPriceUSD } from '../utils/fetch-eth-price';

const app = new Hono();

app.get('/', async (c) => {
  try {
    // getEthereumPriceUSD already logs and averages; call sources again for display clarity
    const start = Date.now();
    const priceCents = await getEthereumPriceUSD();
    if (priceCents == null) {
      return c.json({ error: 'Failed to fetch market price' }, 500);
    }
    const price = (priceCents / 100).toFixed(2);
    return c.json({
      priceUSD: price,
      priceCents: priceCents,
      source: 'OKX + Coinbase (average)',
      fetchedAt: new Date().toISOString(),
      ms: Date.now() - start
    });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unexpected error' }, 500);
  }
});

export default app;
