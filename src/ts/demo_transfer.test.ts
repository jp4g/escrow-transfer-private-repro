import { describe, it, test, expect, beforeAll, beforeEach } from "vitest";
import {
  AccountWallet,
  CompleteAddress,
  PXE,
  AccountWalletWithSecretKey,
  Fr,
} from "@aztec/aztec.js";
import { getInitialTestAccountsWallets } from "@aztec/accounts/testing";
import {
  deployDemoContract,
  setupSandbox,
  deployTokenContractWithMinter,
  wad
} from "./utils.js";
import {
  DemoContractContract as DemoContract,
} from "../artifacts/DemoContract.js";

import {
  TokenContract,
} from "../artifacts/Token.js";

describe("Private Transfer Demo Test", () => {
  let pxe: PXE;
  let wallets: AccountWalletWithSecretKey[] = [];
  let accounts: CompleteAddress[] = [];

  let minter: AccountWallet;
  let alice: AccountWallet;
  let bob: AccountWallet;

  let contractKey: Fr;

  let demoContract: DemoContract;
  let tokenContract: TokenContract;


  beforeAll(async () => {
    // setup PXE
    pxe = await setupSandbox();
    console.log("PXE Setup")
    // get test accounts
    wallets = await getInitialTestAccountsWallets(pxe);
    accounts = wallets.map((w) => w.getCompleteAddress());
    minter = wallets[0];
    alice = wallets[1];
    bob = wallets[2];
    console.log("Got test accounts");

    // deploy token contract
    tokenContract = await deployTokenContractWithMinter(
      { name: "Demo Token", symbol: "DEMO", decimals: 18 },
      minter
    );
    console.log(`Deployed token contract to ${tokenContract.address}`);
    // mint tokens to alice
    await tokenContract
      .withWallet(minter)
      .methods.mint_to_private(
        minter.getAddress(),
        alice.getAddress(),
        wad(1000n)
      )
      .send()
      .wait();
    console.log(`Minted 1000 DEMO to Alice Privately`);

    await tokenContract
      .withWallet(minter)
      .methods.mint_to_public(
        minter.getAddress(),
        wad(1000n)
      )
      .send()
      .wait();
    console.log(`Minted 1000 DEMO to Alice Publicly`);
  });

  // @ THIS ONE
  test("Test external partial notes private", async () => {
    let action = await tokenContract.withWallet(bob).methods.initialize_transfer_commitment(
      alice.getAddress(),
      bob.getAddress(),
      alice.getAddress()
    );
    let commitment = await action.simulate();
    action.send().wait();
    console.log("Commitment:", commitment);
    
    let aliceBalance = await tokenContract.withWallet(alice).methods.balance_of_private(alice.getAddress()).simulate();
    let bobBalance = await tokenContract.withWallet(bob).methods.balance_of_private(bob.getAddress()).simulate();
    console.log("Bob balance before: ", bobBalance)
    console.log("Alice balance before: ", aliceBalance) 

    await tokenContract.withWallet(alice).methods.transfer_private_to_commitment(
      alice.getAddress(),
      commitment,
      1,
      0
    ).send().wait();

    bobBalance = await tokenContract.withWallet(bob).methods.balance_of_private(bob.getAddress()).simulate();
    aliceBalance = await tokenContract.withWallet(alice).methods.balance_of_private(alice.getAddress()).simulate();
    console.log("Bob balance after: ", bobBalance)
    console.log("Alice balance after: ", aliceBalance)
  })

  test.skip("test partial notes through contract", async () => {
    // notes are owned by the contract itself
    ({ contract: demoContract, secretKey: contractKey } = await deployDemoContract(
      pxe,
      alice,
      tokenContract.address,
      wad(1n),
      "self_owned"
    ));
    console.log(`Deployed new demo contract to ${demoContract.address}`);
    demoContract = demoContract.withWallet(alice)
    
    // partial commit in
    const nonce = Fr.random();
    const authwit = await alice.createAuthWit({
      caller: demoContract.address,
      action: tokenContract.methods.transfer_private_to_private(
        alice.getAddress(),
        demoContract.address,
        wad(1n),
        nonce,
      ),
    });
    /// send transfer_in with authwit
    let action = demoContract
      .withWallet(alice)
      .methods
      .partial_commit(nonce)
      .with({ authWitnesses: [authwit] });
    let commitment = await action.simulate();
    await action.send().wait();
    
    // check balances after transfer in
    // aliceBalance = await tokenContract.methods.balance_of_private(alice.getAddress()).simulate();
    // contractBalance = await tokenContract.methods.balance_of_private(demoContract.address).simulate();
    // expect(aliceBalance).toEqual(wad(998n));
    // expect(contractBalance).toEqual(wad(1n));

    // transfer tokens back out
    await demoContract
      .methods
      .fill_commit(commitment, 0)
      .send()
      .wait()
    
    console.log("Filled");
  });
});
