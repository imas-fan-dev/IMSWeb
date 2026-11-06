import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { validFudabaOfficeId } from '@/domains/community/fudaba/contracts/office';
import { fudabaOwnerOfficeView } from '@/domains/community/fudaba/offices/response';
import { fudabaRepository } from '@/middleware/hono-context';

export async function handleGetFudabaOwnerOffice(
    c: Context<AppEnvironment>
): Promise<Response> {
    const officeId = c.req.param('officeId') || '';
    if (!validFudabaOfficeId(officeId)) {
        return c.json({ success: false, code: 'FUDABA_OFFICE_NOT_FOUND' }, 404);
    }
    const office = await fudabaRepository(c).findOfficeForOwner(
        officeId,
        c.get('platformUser')!.id
    );
    return office
        ? c.json({ office: fudabaOwnerOfficeView(office) })
        : c.json({ success: false, code: 'FUDABA_OFFICE_NOT_FOUND' }, 404);
}
