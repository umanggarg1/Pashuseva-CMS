-- Adds "Online Payment" as a distinct method from UPI/Card, per the Create Order
-- payment section addendum.
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE';
