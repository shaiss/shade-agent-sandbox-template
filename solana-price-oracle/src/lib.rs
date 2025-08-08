#![deny(warnings)]
#![forbid(unsafe_code)]

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let price_account = next_account_info(accounts_iter)?; // writable
    let _signer = next_account_info(accounts_iter)?; // signer (fee payer / authority)

    if !price_account.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }

    if instruction_data.len() != 8 {
        msg!("Invalid instruction data length, expected 8 bytes (u64 LE)");
        return Err(ProgramError::InvalidInstructionData);
    }

    // Store raw 8 bytes (u64 price in cents) into account data
    let mut data = price_account.try_borrow_mut_data()?;
    if data.len() < 8 {
        msg!("Account data too small; need at least 8 bytes");
        return Err(ProgramError::InvalidAccountData);
    }
    data[0..8].copy_from_slice(instruction_data);

    Ok(())
}


