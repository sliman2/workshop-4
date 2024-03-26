import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, REGISTRY_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { Node } from "../registry/registry";
import { createRandomSymmetricKey, rsaEncrypt, symEncrypt, exportSymKey } from "../crypto";
import { webcrypto } from "crypto";
import { log } from "console";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

async function generateRandomCircuit() {

  const registryUrl = `http://localhost:${REGISTRY_PORT}/getNodeRegistry`;
  const response = await fetch(registryUrl);
  const { nodes } = await response.json() as { nodes: Node[] };

  const circuit = [] as Node[];
  while (circuit.length < 3) {
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    if (!circuit.includes(randomNode)) {
      circuit.push(randomNode);
      nodes.splice(nodes.indexOf(randomNode), 1);
    }
  }
  return circuit;
}


export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  // TODO implement the status route
  // _user.get("/status", (req, res) => {});

    let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;
  let lastCircuit = [] as number[];

  _user.get("/status", (req, res) => {
    res.send("live");
  });

  _user.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  _user.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  _user.get("/getLastCircuit", (req, res) => {
    res.json({ result: lastCircuit });
  });

  _user.post("/message", (req, res) => {
    const { message } = req.body;
    lastReceivedMessage = message;
    res.send("success");
  });

  _user.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;

    lastSentMessage = message;

    const circuit = await generateRandomCircuit() as Node[];
    lastCircuit = circuit.map(node => node.nodeId);

    var paddedDestination = (destinationUserId + BASE_USER_PORT).toString().padStart(10, "0");

    let encryptedMessage = message;
    for (const node of [...circuit].reverse()) {
      const symmetricKey = await createRandomSymmetricKey() as webcrypto.CryptoKey;

      const destinationAndMessageEncrypted = await symEncrypt(symmetricKey, `${paddedDestination}${encryptedMessage}`);

      const encryptedSymmetricKey = await rsaEncrypt(await exportSymKey(symmetricKey), node.pubKey);

      encryptedMessage = `${encryptedSymmetricKey}${destinationAndMessageEncrypted}`;

      paddedDestination = (node.nodeId + BASE_ONION_ROUTER_PORT).toString().padStart(10, "0");
    }


    const entryNode = circuit[0];
    await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + entryNode.nodeId}/message`, {
      method: "POST",
      headers: {
      "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: encryptedMessage })
    });

    res.send("success");
  });



  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}
