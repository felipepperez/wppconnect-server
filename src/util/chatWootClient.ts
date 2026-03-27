/*
 * Copyright 2021 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { default as FormData } from 'form-data';
import mime from 'mime-types';
import QRCode from 'qrcode';

import bufferutils from './bufferutils';
// import bufferUtils from './bufferutils';
import { eventEmitter } from './sessionUtil';

export default class chatWootClient {
  declare config: any;
  declare session: any;
  declare mobile_name: any;
  declare mobile_number: any;
  declare sender: any;
  declare account_id: any;
  declare inbox_id: any;
  declare api: AxiosInstance;
  declare contactCreationLocks: Map<string, Promise<any>>;
  declare conversationCreationLocks: Map<string, Promise<any>>;

  constructor(config: any, session: string) {
    this.config = config;
    this.mobile_name = this.config.mobile_name
      ? this.config.mobile_name
      : `WPPConnect`;
    this.mobile_number = this.config.mobile_number
      ? this.config.mobile_number
      : '5511999999999';
    this.sender = {
      pushname: this.mobile_name,
      id: this.mobile_number,
    };
    this.account_id = this.config.account_id;
    this.inbox_id = this.config.inbox_id;
    this.api = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        api_access_token: this.config.token,
      },
    });
    this.contactCreationLocks = new Map();
    this.conversationCreationLocks = new Map();
    eventEmitter.removeAllListeners(`qrcode-${session}`);
    eventEmitter.removeAllListeners(`status-${session}`);
    eventEmitter.removeAllListeners(`mensagem-${session}`);

    //assina o evento do qrcode
    eventEmitter.on(`qrcode-${session}`, (qrCode, urlCode, client) => {
      setTimeout(async () => {
        if (config?.chatwoot?.sendQrCode !== false) {
          let qrCodeBase64 = '';
          if (urlCode) {
            const qrOptions = {
              errorCorrectionLevel: 'M' as const,
              type: 'image/png' as const,
              scale: 5,
              width: 500,
            };
            const qrDataUrl = await QRCode.toDataURL(urlCode, qrOptions);
            qrCodeBase64 = qrDataUrl.replace('data:image/png;base64,', '');
          } else if (typeof qrCode === 'string') {
            qrCodeBase64 = qrCode.replace('data:image/png;base64,', '');
          }
          console.log('[chatwoot-client] before sendMessage (qrcode)', {
            session,
            hasQrCode: !!qrCode,
            qrCodeSize: typeof qrCode === 'string' ? qrCode.length : 0,
            hasUrlCode: !!urlCode,
            generatedQrSize: qrCodeBase64.length,
            hasClient: !!client,
          });
          if (!qrCodeBase64) return;
          this.sendMessage(client, {
            sender: this.sender,
            chatId: this.mobile_number + '@c.us',
            type: 'image',
            timestamp: 'qrcode',
            mimetype: 'image/png',
            caption: 'leia o qrCode',
            qrCode: qrCodeBase64,
          });
        }
      }, 1000);
    });

    //assiona o evento do status
    eventEmitter.on(`status-${session}`, (client, status) => {
      if (config?.chatwoot?.sendStatus !== false) {
        console.log('[chatwoot-client] before sendMessage (status)', {
          session,
          status,
          hasClient: !!client,
        });
        this.sendMessage(client, {
          sender: this.sender,
          chatId: this.mobile_number + '@c.us',
          body: `wppconnect status: ${status} `,
        });
      }
    });

    //assina o evento de mensagem
    eventEmitter.on(`mensagem-${session}`, (client, message) => {
      if (this.shouldIgnoreMessage(message)) return;
      console.log('[chatwoot-client] before sendMessage (mensagem)', {
        session,
        hasClient: !!client,
        messageId: message?.id,
        chatId: message?.chatId,
        type: message?.type,
        isGroupMsg: message?.isGroupMsg,
        broadcast: message?.broadcast,
        isBroadcastMsg: message?.isBroadcastMsg,
        bodyLength:
          typeof message?.body === 'string' ? message.body.length : undefined,
        hasAttachments:
          Array.isArray(message?.attachments) && message.attachments.length > 0,
      });
      this.sendMessage(client, message);
    });
  }

  // async sendMessage(client: any, message: any) {
  //   if (message.isGroupMsg || message.chatId.indexOf('@broadcast') > 0) return;
  //   const contact = await this.createContact(message);
  //   const conversation = await this.createConversation(
  //     contact,
  //     message.chatId.split('@')[0]
  //   );

  //   try {
  //     if (
  //       message.type == 'image' ||
  //       message.type == 'video' ||
  //       message.type == 'in' ||
  //       message.type == 'document' ||
  //       message.type == 'ptt' ||
  //       message.type == 'audio' ||
  //       message.type == 'sticker'
  //     ) {
  //       if (message.mimetype == 'image/webp') message.mimetype = 'image/jpeg';
  //       const extension = mime.extension(message.mimetype);
  //       const filename = `${message.timestamp}.${extension}`;
  //       let b64;

  //       if (message.qrCode) b64 = message.qrCode;
  //       else {
  //         const buffer = await client.decryptFile(message);
  //         b64 = await buffer.toString('base64');
  //       }

  //       const mediaData = Buffer.from(b64, 'base64');

  //       // Create a readable stream from the Buffer
  //       const stream = new Readable();
  //       stream.push(mediaData);
  //       stream.push(null); // Signaling the end of the stream

  //       const data = new FormData();
  //       if (message.caption) {
  //         data.append('content', message.caption);
  //       }

  //       data.append('attachments[]', stream, {
  //         filename: filename,
  //         contentType: message.mimetype,
  //       });

  //       data.append('message_type', 'incoming');
  //       data.append('private', 'false');

  //       const configPost = Object.assign(
  //         {},
  //         {
  //           baseURL: this.config.baseURL,
  //           headers: {
  //             'Content-Type': 'application/json;charset=utf-8',
  //             api_access_token: this.config.token,
  //           },
  //         }
  //       );

  //       configPost.headers = { ...configPost.headers, ...data.getHeaders() };
  //       console.log('PRÉ-REQUEST');
  //       const result = await axios.post(
  //         `api/v1/accounts/${this.account_id}/conversations/${conversation.id}/messages`,
  //         data,
  //         configPost
  //       );
  //       console.log('POS-REQUEST');
  //       return result;
  //     } else {
  //       const body = {
  //         content: message.body,
  //         message_type: 'incoming',
  //       };
  //       const { data } = await this.api.post(
  //         `api/v1/accounts/${this.account_id}/conversations/${conversation.id}/messages`,
  //         body
  //       );
  //       return data;
  //     }
  //   } catch (e) {
  //     return null;
  //   }
  // }

  shouldIgnoreMessage(message: any) {
    const chatId = message?.chatId || '';
    const type = String(message?.type || '');
    const isBroadcast =
      message?.broadcast === true ||
      message?.isBroadcastMsg === true ||
      chatId.includes('@broadcast') ||
      String(message?.id || '').includes('status@broadcast');
    const unsupportedTypes = ['gp2', 'notification_template', 'protocol'];
    return message?.isGroupMsg || isBroadcast || !chatId || unsupportedTypes.includes(type);
  }

  async sendMessage(client: any, message: any) {
    const chatId = message?.chatId || '';
    if (this.shouldIgnoreMessage(message)) return;
    const mediaTypes = ['image', 'video', 'in', 'document', 'ptt', 'audio', 'sticker'];
    const isMediaMessage = mediaTypes.includes(message?.type);
    const hasTextContent =
      typeof message?.body === 'string' && message.body.trim().length > 0;
    if (!isMediaMessage && !hasTextContent) return;

    const contact = await this.createContact(message);
    if (!contact) return;
    const conversation = await this.createConversation(
      contact,
      message.chatId.split('@')[0]
    );
    if (!conversation) return;

    try {
      if (isMediaMessage) {
        if (message.mimetype === 'image/webp') message.mimetype = 'image/jpeg';
        const extension = mime.extension(message.mimetype);
        const filename = `${message.timestamp}.${extension}`;
        let b64;

        if (message.qrCode) {
          b64 = message.qrCode;
        } else {
          const buffer = await client.decryptFile(message);
          b64 = buffer.toString('base64');
        }

        const mediaData = Buffer.from(b64, 'base64');
        const stream = bufferutils.bufferToReadableStream(mediaData);

        const data = new FormData();
        if (message.caption) {
          data.append('content', message.caption);
        }

        data.append('attachments[]', stream, {
          filename: filename,
          contentType: message.mimetype,
        });

        data.append('message_type', 'incoming');
        data.append('private', 'false');

        const configPost: AxiosRequestConfig = {
          baseURL: this.config.baseURL,
          headers: {
            api_access_token: this.config.token,
            ...data.getHeaders(),
          },
        };
        const endpoint = `api/v1/accounts/${this.account_id}/conversations/${conversation.id}/messages`;

        const result = await axios.post(endpoint, data, configPost);

        return result;
      } else {
        const body = {
          content: message.body,
          message_type: 'incoming',
        };
        const endpoint = `api/v1/accounts/${this.account_id}/conversations/${conversation.id}/messages`;

        const { data } = await this.api.post(endpoint, body);
        return data;
      }
    } catch (e) {
      console.error('Error sending message:', e);
      return null;
    }
  }

  async findContact(query: string) {
    try {
      const { data } = await this.api.get(
        `api/v1/accounts/${this.account_id}/contacts/search/?q=${query}`
      );
      return data;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  normalizePhone(value: any) {
    return String(value || '').replace(/\D/g, '');
  }

  findExactContactByPhone(contactSearchResult: any, phoneDigits: string) {
    if (!contactSearchResult || !Array.isArray(contactSearchResult.payload)) return null;
    return (
      contactSearchResult.payload.find(
        (contact: any) => this.normalizePhone(contact?.phone_number) === phoneDigits
      ) || null
    );
  }

  async createContact(message: any) {
    const rawSenderId =
      typeof message?.sender?.id == 'object'
        ? message?.sender?.id?.user
        : String(message?.sender?.id || '').split('@')[0];
    const phoneDigits = this.normalizePhone(rawSenderId);
    if (!phoneDigits) return null;
    const body = {
      inbox_id: this.inbox_id,
      name: message.sender.isMyContact
        ? message.sender.formattedName
        : message.sender.pushname || message.sender.formattedName,
      phone_number: `+${phoneDigits}`,
    };
    const contact = await this.findContact(phoneDigits);
    const exactContact = this.findExactContactByPhone(contact, phoneDigits);
    if (exactContact) return exactContact;

    const pendingCreation = this.contactCreationLocks.get(phoneDigits);
    if (pendingCreation) return await pendingCreation;

    const createContactPromise = (async () => {
      const recheck = await this.findContact(phoneDigits);
      const recheckContact = this.findExactContactByPhone(recheck, phoneDigits);
      if (recheckContact) return recheckContact;

      try {
        const data = await this.api.post(
          `api/v1/accounts/${this.account_id}/contacts`,
          body
        );
        return data.data.payload.contact;
      } catch (e) {
        const postErrorCheck = await this.findContact(phoneDigits);
        const postErrorContact = this.findExactContactByPhone(
          postErrorCheck,
          phoneDigits
        );
        if (postErrorContact) return postErrorContact;
        console.log(e);
        return null;
      } finally {
        this.contactCreationLocks.delete(phoneDigits);
      }
    })();
    this.contactCreationLocks.set(phoneDigits, createContactPromise);
    return await createContactPromise;
  }

  async findConversation(contact: any) {
    try {
      const { data } = await this.api.get(
        `api/v1/accounts/${this.account_id}/contacts/${contact.id}/conversations`
      );
      const conversations = Array.isArray(data?.payload) ? data.payload : [];
      const activeConversations = conversations
        .filter((e: any) => e?.inbox_id == this.inbox_id && e?.status !== 'resolved')
        .sort((a: any, b: any) => {
          const aDate = new Date(
            a?.last_activity_at || a?.updated_at || a?.created_at || 0
          ).getTime();
          const bDate = new Date(
            b?.last_activity_at || b?.updated_at || b?.created_at || 0
          ).getTime();
          return bDate - aDate;
        });
      return activeConversations[0] || null;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  async createConversation(contact: any, source_id: any) {
    const sourceId = String(source_id || '');
    if (!sourceId) return null;
    const conversation = await this.findConversation(contact);
    if (conversation) return conversation;
    const pendingCreation = this.conversationCreationLocks.get(sourceId);
    if (pendingCreation) return await pendingCreation;

    const body = {
      source_id: sourceId,
      inbox_id: this.inbox_id,
      contact_id: contact.id,
      status: 'open',
    };

    const createConversationPromise = (async () => {
      const recheck = await this.findConversation(contact);
      if (recheck) return recheck;
      try {
        const { data } = await this.api.post(
          `api/v1/accounts/${this.account_id}/conversations`,
          body
        );
        return data;
      } catch (e) {
        const postErrorCheck = await this.findConversation(contact);
        if (postErrorCheck) return postErrorCheck;
        console.log(e);
        return null;
      } finally {
        this.conversationCreationLocks.delete(sourceId);
      }
    })();
    this.conversationCreationLocks.set(sourceId, createConversationPromise);
    return await createConversationPromise;
  }
}
