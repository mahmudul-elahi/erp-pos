import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // User & Access
  { name: 'users.manage', module: 'users', description: 'Create, update, delete users' },
  { name: 'users.view', module: 'users', description: 'View users list and profiles' },
  { name: 'roles.manage', module: 'roles', description: 'Create, edit roles and assign permissions' },
  { name: 'roles.view', module: 'roles', description: 'View roles and permissions' },

  // Branches & Warehouses
  { name: 'branches.manage', module: 'branches', description: 'Create and update branches' },
  { name: 'branches.view', module: 'branches', description: 'View branches' },
  { name: 'warehouses.manage', module: 'warehouses', description: 'Create and update warehouses' },
  { name: 'warehouses.view', module: 'warehouses', description: 'View warehouses' },

  // Audit & Files
  { name: 'audit_logs.view', module: 'audit_logs', description: 'View audit logs' },
  { name: 'files.manage', module: 'files', description: 'Upload, delete, and manage files' },
  { name: 'files.view', module: 'files', description: 'View and download files' },

  // Catalog (for future phases)
  { name: 'products.manage', module: 'products', description: 'Create and manage product catalog' },
  { name: 'products.view', module: 'products', description: 'View product catalog' },

  // People (Customers & Suppliers)
  { name: 'customers.manage', module: 'customers', description: 'Create, update, and manage customers' },
  { name: 'customers.view', module: 'customers', description: 'View customers list and customer ledgers' },
  { name: 'suppliers.manage', module: 'suppliers', description: 'Create, update, and manage suppliers' },
  { name: 'suppliers.view', module: 'suppliers', description: 'View suppliers list and supplier ledgers' },

  // Inventory & Logistics
  { name: 'inventory.manage', module: 'inventory', description: 'Perform stock adjustments and transfers' },
  { name: 'inventory.view', module: 'inventory', description: 'View inventory levels and movements' },

  // Sales & POS
  { name: 'sales.create', module: 'sales', description: 'Process POS checkout and create sales' },
  { name: 'sales.refund', module: 'sales', description: 'Process sales refunds and returns' },
  { name: 'sales.view', module: 'sales', description: 'View sales and shifts' },

  // Purchases
  { name: 'purchases.create', module: 'purchases', description: 'Create purchase orders' },
  { name: 'purchases.receive', module: 'purchases', description: 'Receive purchased inventory' },
  { name: 'purchases.view', module: 'purchases', description: 'View purchases and suppliers' },

  // Orders & Couriers
  { name: 'orders.manage', module: 'orders', description: 'Update order status and workflow' },
  { name: 'orders.view', module: 'orders', description: 'View orders list and history' },
  { name: 'couriers.manage', module: 'couriers', description: 'Dispatch courier shipments and manage courier settings' },
  { name: 'couriers.view', module: 'couriers', description: 'View shipments and tracking info' },

  // Cash Accounts & Expenses
  { name: 'cash_accounts.manage', module: 'cash_accounts', description: 'Create and transfer between cash accounts' },
  { name: 'cash_accounts.view', module: 'cash_accounts', description: 'View cash accounts and transaction ledgers' },
  { name: 'expenses.manage', module: 'expenses', description: 'Create and manage store expenses' },
  { name: 'expenses.view', module: 'expenses', description: 'View store expenses and expense categories' },

  // Marketing & Reviews
  { name: 'marketing.manage', module: 'marketing', description: 'Create coupons, promotions, and storefront banners' },
  { name: 'marketing.view', module: 'marketing', description: 'View coupons, promotions, and banners' },
  { name: 'reviews.manage', module: 'marketing', description: 'Moderate and manage customer product reviews' },

  // Gadget-Specific Workflows
  { name: 'gadgets.buyback_manage', module: 'gadgets', description: 'Inspect, negotiate, and purchase buyback devices' },
  { name: 'gadgets.buyback_view', module: 'gadgets', description: 'View buyback requests' },
  { name: 'gadgets.warranty_manage', module: 'gadgets', description: 'Manage and update warranty claims' },
  { name: 'gadgets.warranty_view', module: 'gadgets', description: 'View warranty claims and verify device IMEI/serial' },

  // Telesales
  { name: 'telesales.lead_manage', module: 'telesales', description: 'Create, assign, update, and convert telesales leads' },
  { name: 'telesales.lead_view', module: 'telesales', description: 'View telesales leads and customer interaction logs' },
  { name: 'telesales.call_log', module: 'telesales', description: 'Log outbound calls and scheduled customer callbacks' },

  // Partners (Dealers, Retailers, B2B, Franchises)
  { name: 'partners.manage', module: 'partners', description: 'Create, approve, and manage partner accounts and price tiers' },
  { name: 'partners.view', module: 'partners', description: 'View partner accounts and ledgers' },
  { name: 'partners.ledger_manage', module: 'partners', description: 'Record partner invoices, payments, and commission credits' },

  // Director Treasury
  { name: 'directors.manage', module: 'directors', description: 'Create and manage directors and shareholding percentage' },
  { name: 'directors.view', module: 'directors', description: 'View director profiles and capital/drawing ledgers' },
  { name: 'directors.transaction', module: 'directors', description: 'Process director capital deposits and drawing withdrawals' },

  // Reports & Dashboard
  { name: 'reports.view', module: 'reports', description: 'View financial and operational reports' },
  { name: 'dashboard.view', module: 'dashboard', description: 'View executive operational dashboards' },
];

async function main() {
  console.log('Seeding foundation data...');

  // 1. Seed Permissions
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, module: perm.module },
      create: perm,
    });
  }
  console.log(`✓ Seeded ${PERMISSIONS.length} permissions`);

  // 2. Seed Default Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'super_admin' },
    update: { isSystem: true },
    create: {
      name: 'super_admin',
      description: 'System Super Administrator with full privileges',
      isSystem: true,
    },
  });

  const branchManagerRole = await prisma.role.upsert({
    where: { name: 'branch_manager' },
    update: {},
    create: {
      name: 'branch_manager',
      description: 'Branch Manager overseeing store operations',
      isSystem: false,
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: 'cashier' },
    update: {},
    create: {
      name: 'cashier',
      description: 'POS Cashier handling checkout and shifts',
      isSystem: false,
    },
  });

  const allPerms = await prisma.permission.findMany();

  // Attach all permissions to super_admin
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: superAdminRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Attach branch manager permissions
  const managerPermNames = [
    'branches.view',
    'warehouses.view',
    'products.view',
    'customers.manage',
    'customers.view',
    'suppliers.manage',
    'suppliers.view',
    'inventory.manage',
    'inventory.view',
    'sales.create',
    'sales.refund',
    'sales.view',
    'purchases.create',
    'purchases.receive',
    'purchases.view',
    'orders.manage',
    'orders.view',
    'couriers.manage',
    'couriers.view',
    'cash_accounts.manage',
    'cash_accounts.view',
    'expenses.manage',
    'expenses.view',
    'marketing.manage',
    'marketing.view',
    'reviews.manage',
    'gadgets.buyback_manage',
    'gadgets.buyback_view',
    'gadgets.warranty_manage',
    'gadgets.warranty_view',
    'telesales.lead_manage',
    'telesales.lead_view',
    'telesales.call_log',
    'partners.manage',
    'partners.view',
    'partners.ledger_manage',
    'directors.view',
    'reports.view',
    'dashboard.view',
  ];
  for (const perm of allPerms.filter((p) => managerPermNames.includes(p.name))) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: branchManagerRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: branchManagerRole.id,
        permissionId: perm.id,
      },
    });
  }

  // Attach cashier permissions
  const cashierPermNames = [
    'products.view',
    'inventory.view',
    'sales.create',
    'sales.view',
  ];
  for (const perm of allPerms.filter((p) => cashierPermNames.includes(p.name))) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: cashierRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: cashierRole.id,
        permissionId: perm.id,
      },
    });
  }
  console.log('✓ Seeded roles and role permissions');

  // 3. Seed Default Main Branch & Warehouse
  const mainBranch = await prisma.branch.upsert({
    where: { code: 'BRANCH-MAIN' },
    update: { isMain: true, isActive: true },
    create: {
      name: 'Main Flagship Branch',
      code: 'BRANCH-MAIN',
      address: 'Dhaka, Bangladesh',
      phone: '+8801700000000',
      email: 'main@erppos.local',
      isMain: true,
      isActive: true,
    },
  });

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' },
    update: { isDefault: true, isActive: true, branchId: mainBranch.id },
    create: {
      name: 'Central Warehouse',
      code: 'WH-MAIN',
      location: 'Central Dhaka Logistics Hub',
      branchId: mainBranch.id,
      isDefault: true,
      isActive: true,
    },
  });
  console.log(`✓ Seeded branch (${mainBranch.code}) and warehouse (${mainWarehouse.code})`);

  // 4. Seed Super Admin User
  const adminEmail = 'admin@erppos.local';
  const adminPassword = 'AdminPassword123!';
  const passwordHash = await argon2.hash(adminPassword);

  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      isSuperAdmin: true,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: adminEmail,
      name: 'Super Administrator',
      phone: '+8801800000000',
      passwordHash,
      isSuperAdmin: true,
      status: UserStatus.ACTIVE,
    },
  });

  // Assign super_admin role
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
    },
  });

  // Assign to main branch as default
  await prisma.userBranch.upsert({
    where: {
      userId_branchId: {
        userId: superAdmin.id,
        branchId: mainBranch.id,
      },
    },
    update: { isDefault: true },
    create: {
      userId: superAdmin.id,
      branchId: mainBranch.id,
      isDefault: true,
    },
  });

  console.log(`✓ Seeded Super Admin: ${adminEmail}`);

  // 5. Seed Default Cash Accounts
  const mainCashAccount = await prisma.cashAccount.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Cash Drawer',
      type: 'CASH',
      balance: 0,
      branchId: mainBranch.id,
      isDefault: true,
      isActive: true,
    },
  });

  const pettyCashAccount = await prisma.cashAccount.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Petty Cash Wallet',
      type: 'CASH',
      balance: 0,
      branchId: mainBranch.id,
      isDefault: false,
      isActive: true,
    },
  });

  console.log('✓ Seeded default Cash Accounts');

  // 6. Seed Default Expense Categories
  const defaultCategories = [
    { name: 'Shop Rent', code: 'RENT', description: 'Showroom and store rent payments' },
    { name: 'Electricity & Utilities', code: 'UTILITY', description: 'DESCO, water, internet utilities' },
    { name: 'Staff Entertainment & Snacks', code: 'SNACKS', description: 'Daily tea and snacks for shop staff' },
    { name: 'Packaging & Supplies', code: 'SUPPLY', description: 'Bubble wraps, shopping bags, tape' },
    { name: 'Courier Logistics', code: 'COURIER', description: 'Courier shipping and delivery expenses' },
    { name: 'Marketing & Advertisements', code: 'MKTG', description: 'Facebook and Google ads' },
  ];

  for (const cat of defaultCategories) {
    await prisma.expenseCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }
  console.log('✓ Seeded default Expense Categories');

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
