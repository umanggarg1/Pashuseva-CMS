import { customerNoteRepository } from '../repositories/customerNote.repository';
import { customerRepository } from '../repositories/customer.repository';
import { NotFoundError } from '../utils/httpError';

export const customerNoteService = {
  async add(customerId: number, note: string, createdById: number) {
    const customer = await customerRepository.findAssignmentById(customerId);
    if (!customer) throw new NotFoundError('Customer not found');

    const created = await customerNoteRepository.create(customerId, note, createdById);
    await customerRepository.recordActivity(customerId, 'Note added', createdById);
    return created;
  },

  list(customerId: number) {
    return customerNoteRepository.listForCustomer(customerId);
  },
};
