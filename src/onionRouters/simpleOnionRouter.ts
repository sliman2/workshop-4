import bodyParser from "body-parser";
import express from "express";
import { generateRsaKeyPair, exportPubKey, exportPrvKey, exportSymKey, importSymKey, rsaDecrypt, symDecrypt } from "../crypto";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { log } from "console";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  // TODO implement the status route
  // onionRouter.get("/status", (req, res) => {});
    const keyPair = await generateRsaKeyPair();


  const registryUrl = `http://localhost:${REGISTRY_PORT}/registerNode`;
  const response = await fetch(registryUrl, {
    method: "POST",
    body: JSON.stringify({
      nodeId,
      pubKey: await exportPubKey(keyPair.publicKey),
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });

  var lastReceivedEncryptedMessage: string | null = null;
  var lastReceivedDecryptedMessage: string | null = null;
  var lastMessageDestination: number | null = null;

  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastMessageDestination });
  });

  onionRouter.get("/getPrivateKey", (req, res) => {
    exportPrvKey(keyPair.privateKey).then((result) => {
      res.json({ result });
    });
  });

  onionRouter.post("/message", async (req, res) => {
    const { message } = req.body;

    lastReceivedEncryptedMessage = message;

    const encryptedSymmetricKey = message.slice(0, 344);
    const encryptedDestinationAndMessage = message.slice(344);

    const symmetricKey = await rsaDecrypt(encryptedSymmetricKey, keyPair.privateKey);

    const destinationAndMessage = await symDecrypt(symmetricKey, encryptedDestinationAndMessage);

    const destination = parseInt(destinationAndMessage.slice(0, 10));
    const decryptedMessage = destinationAndMessage.slice(10);

    lastMessageDestination = destination;
    lastReceivedDecryptedMessage = decryptedMessage;


    await fetch(`http://localhost:${destination}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: decryptedMessage }),
    });

    res.send("success");
  });


  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}
