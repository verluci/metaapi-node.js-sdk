'use strict';

import should from 'should';
import sinon from 'sinon';
import RpcMetaApiConnection from './rpcMetaApiConnection';
import NotSynchronizedError from '../clients/metaApi/notSynchronizedError';
import TimeoutError from '../clients/timeoutError';

/**
 * @test {MetaApiConnection}
 */
// eslint-disable-next-line max-statements
describe('RpcMetaApiConnection', () => {

  let sandbox;
  let api;
  let account;
  let clock;
  let client = {
    getAccountInformation: () => {},
    addSynchronizationListener: () => {},
    removeSynchronizationListener: () => {},
    ensureSubscribe: () => {},
    removeApplication: () => {},
    trade: () => {},
    reconnect: () => {},
    calculateMargin: () => {},
    waitSynchronized: () => {},
    addAccountCache: () => {},
    removeAccountCache: () => {}
  };

  let accountRegions = {
    'vint-hill': 'accountId',
    'new-york': 'accountIdReplica'
  };

  let connectionRegistry = {
    connectRpc: () => {},
    removeRpc: () => {}
  };

  before(() => {
    sandbox = sinon.createSandbox();
  });

  beforeEach(() => {
    account = {
      id: 'accountId', 
      state: 'DEPLOYED',
      accountRegions,
      reload: () => {}
    };
    api = new RpcMetaApiConnection(client, account, connectionRegistry);
    clock = sinon.useFakeTimers({
      shouldAdvanceTime: true
    });
  });

  afterEach(() => {
    clock.restore();
    sandbox.restore();
  });

  /**
   * @test {MetaApiConnection#connect}
   */
  it('should connect rpc connection', async () => {
    sandbox.stub(client, 'addAccountCache').returns();
    sandbox.stub(client, 'ensureSubscribe').resolves();
    await api.connect();
    sinon.assert.calledWith(client.addAccountCache, 'accountId', accountRegions);
    sinon.assert.calledWith(client.ensureSubscribe, 'accountId', 0);
    sinon.assert.calledWith(client.ensureSubscribe, 'accountId', 1);
    sinon.assert.calledWith(client.ensureSubscribe, 'accountIdReplica', 0);
    sinon.assert.calledWith(client.ensureSubscribe, 'accountIdReplica', 1);
  });

  /**
   * @test {MetaApiConnection#close}
   */
  it('should close connection only if all instances closed', async () => {
    sandbox.stub(client, 'removeAccountCache').returns();
    sandbox.stub(connectionRegistry, 'removeRpc').resolves();
    await api.connect('accountId');
    await api.connect('accountId');
    await api.connect('accountId2');
    await api.connect('accountId3');
    await api.close('accountId');
    sinon.assert.notCalled(client.removeAccountCache);
    await api.close('accountId3');
    sinon.assert.notCalled(client.removeAccountCache);
    await api.close('accountId2');
    sinon.assert.calledWith(client.removeAccountCache, 'accountId');
    sinon.assert.calledWith(connectionRegistry.removeRpc, account);
  });

  /**
   * @test {MetaApiConnection#onConnected}
   */
  it('should process onConnected event', async () => {
    await api.onConnected('vint-hill:1:ps-mpa-1', 1);
    sinon.assert.match(api.isSynchronized(), true);
  });

  /**
   * @test {MetaApiConnection#onDisconnected}
   */
  it('should process onDisconnected event', async () => {
    await api.onConnected('vint-hill:1:ps-mpa-1', 1);
    await api.onConnected('vint-hill:1:ps-mpa-2', 1);
    sinon.assert.match(api.isSynchronized(), true);
    await api.onDisconnected('vint-hill:1:ps-mpa-1');
    sinon.assert.match(api.isSynchronized(), true);
    await api.onDisconnected('vint-hill:1:ps-mpa-2');
    sinon.assert.match(api.isSynchronized(), false);
  });

  /**
   * @test {MetaApiConnection#onStreamClosed}
   */
  it('should process onStreamClosed event', async () => {
    await api.onConnected('vint-hill:1:ps-mpa-1', 1);
    await api.onConnected('vint-hill:1:ps-mpa-2', 1);
    sinon.assert.match(api.isSynchronized(), true);
    await api.onStreamClosed('vint-hill:1:ps-mpa-1');
    sinon.assert.match(api.isSynchronized(), true);
    await api.onStreamClosed('vint-hill:1:ps-mpa-2');
    sinon.assert.match(api.isSynchronized(), false);
  });

  /**
   * @test {MetaApiConnection#waitSynchronized}
   */
  it('should wait until RPC application is synchronized', async () => {
    await api.connect();
    sandbox.stub(client, 'waitSynchronized').onFirstCall().rejects(new TimeoutError('test'))
      .onSecondCall().rejects(new TimeoutError('test'))
      .onThirdCall().resolves('response');
    (async () => {
      await new Promise(res => setTimeout(res, 50));
      await api.onConnected();
    })();
    clock.tickAsync(1100);
    await api.waitSynchronized();
  });

  /**
   * @test {MetaApiConnection#waitSynchronized}
   */
  it('should time out waiting for synchronization', async () => {
    await api.connect();
    sandbox.stub(client, 'waitSynchronized').callsFake(async () => {
      await new Promise(res => setTimeout(res, 100)); 
      throw new TimeoutError('test');
    });
    try {
      (async () => {
        await new Promise(res => setTimeout(res, 50));
        await api.onConnected();
      })();
      clock.tickAsync(1100);
      await api.waitSynchronized(0.09); 
      throw new Error('TimeoutError expected');
    } catch (err) {
      err.name.should.equal('TimeoutError');
    }
    sinon.assert.calledOnce(client.waitSynchronized);
  });

  /**
   * @test {MetaApiConnection#waitSynchronized}
   */
  it('should time out waiting for synchronization if no connected event has arrived', async () => {
    await api.connect();
    sandbox.stub(client, 'waitSynchronized').resolves();
    try {
      clock.tickAsync(1100);
      await api.waitSynchronized(0.09); 
      throw new Error('TimeoutError expected');
    } catch (err) {
      err.name.should.equal('TimeoutError');
    }
  });

});
