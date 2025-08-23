import {
  waitForPXE,
  createPXEClient,
  AccountWallet,
  Contract,
  AztecAddress,
  Fr,
  deriveKeys,
  PXE,
  DeployOptions,
} from "@aztec/aztec.js";
import { computePartialAddress } from "@aztec/stdlib/contract";
import {
  DemoContractContract as DemoContract,
  DemoContractContractArtifact as DemoContractArtifact
} from "../artifacts/DemoContract.js";
import {
  TokenContract,
  TokenContractArtifact
} from "../artifacts/Token.js";


export const createPXE = async (id: number = 0) => {
  const { BASE_PXE_URL = `http://localhost` } = process.env;
  const url = `${BASE_PXE_URL}:${8080 + id}`;
  const pxe = createPXEClient(url);
  await waitForPXE(pxe);
  return pxe;
};

export const setupSandbox = async () => {
  return createPXE();
};

export const wad = (n: bigint = 1n, decimals: bigint = 18n) =>
  n * 10n ** decimals;

/**
 * Deploys the Counter contract.
 * @param deployer - The wallet to deploy the contract with.
 * @param owner - The address of the owner of the contract.
 * @returns A deployed contract instance.
 */
export async function deployDemoContract(
  pxe: PXE,
  deployer: AccountWallet,
  tokenAddress: AztecAddress,
  tokenAmount: bigint,
  constructor_type: "self_owned" | "sender_owned" = "self_owned",
  deployOptions?: DeployOptions,
): Promise<{ contract: DemoContract, secretKey: Fr }> {

  // get keys for contract
  const contractSecretKey = Fr.random();
  const contractPublicKeys = (await deriveKeys(contractSecretKey)).publicKeys;

  // set up contract deployment tx
  const contractDeployment = await Contract.deployWithPublicKeys(
    contractPublicKeys,
    deployer,
    DemoContractArtifact,
    [tokenAddress, tokenAmount],
    `constructor_${constructor_type}`
  );

  // add contract decryption keys to PXE
  const partialAddress = await computePartialAddress(
    await contractDeployment.getInstance(),
  );
  await pxe.registerAccount(contractSecretKey, partialAddress);

  // deploy contract
  const contract = await contractDeployment.send(deployOptions).deployed();

  return {
    contract: contract as DemoContract,
    secretKey: contractSecretKey,
  };
}

export async function deployTokenContractWithMinter(
  tokenMetadata: { name: string; symbol: string; decimals: number },
  deployer: AccountWallet,
  deployOptions?: DeployOptions,
): Promise<TokenContract> {
  const contract = await Contract.deploy(
    deployer,
    TokenContractArtifact,
    [
      tokenMetadata.name,
      tokenMetadata.symbol,
      tokenMetadata.decimals,
      deployer.getAddress(),
      AztecAddress.ZERO,
    ],
    "constructor_with_minter",
  )
    .send(deployOptions)
    .deployed();
  return contract as TokenContract;
}