-- Phase 14 #5: indexes for the Order columns every filter/dashboard/report query
-- actually uses (orderStatus, deliveryStatus, paymentStatus, orderDate); none of
-- these had an index before.
CREATE INDEX "Order_orderStatus_idx" ON "Order"("orderStatus");
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");
