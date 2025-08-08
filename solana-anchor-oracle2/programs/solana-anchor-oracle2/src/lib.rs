use anchor_lang::prelude::*;

declare_id!("ETk3hHnf9BMPguy2q36UWmx1WiezALWD8TZSrpfNewf7");

#[program]
pub mod solana_anchor_oracle2 {
    use super::*;

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        let account = &mut ctx.accounts.price_account;
        account.price = new_price;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(init_if_needed, payer = authority, space = 8 + 8)]
    pub price_account: Account<'info, PriceAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PriceAccount {
    pub price: u64,
}
