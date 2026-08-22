UPDATE market_data_daily AS current_row
SET volume_change = current_row.volume - (
  SELECT previous.volume
  FROM market_data_daily AS previous
  WHERE previous.trade_date < current_row.trade_date
  ORDER BY previous.trade_date DESC
  LIMIT 1
)
WHERE current_row.volume IS NOT NULL;
