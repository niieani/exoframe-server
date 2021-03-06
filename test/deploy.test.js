/* eslint-env jest */
// mock config for testing
jest.mock('../src/config', () => require('./__mocks__/config'));
const config = require('../src/config');
// switch config to normal
config.__load('normal');

// npm packages
const path = require('path');
const tar = require('tar-fs');
const getPort = require('get-port');

// our packages
const authToken = require('./fixtures/authToken');
const {startServer} = require('../src');
const docker = require('../src/docker/docker');
const {initNetwork} = require('../src/docker/network');

// create tar streams
const streamDocker = tar.pack(path.join(__dirname, 'fixtures', 'docker-project'));
const streamNode = tar.pack(path.join(__dirname, 'fixtures', 'node-project'));
const streamHtml = tar.pack(path.join(__dirname, 'fixtures', 'html-project'));
const streamHtmlUpdate = tar.pack(path.join(__dirname, 'fixtures', 'html-project'));
const streamCompose = tar.pack(path.join(__dirname, 'fixtures', 'compose-project'));
const streamComposeUpdate = tar.pack(path.join(__dirname, 'fixtures', 'compose-project'));
const streamBrokenDocker = tar.pack(path.join(__dirname, 'fixtures', 'broken-docker-project'));
const streamBrokenNode = tar.pack(path.join(__dirname, 'fixtures', 'broken-node-project'));
const streamAdditionalLabels = tar.pack(path.join(__dirname, 'fixtures', 'additional-labels'));
const streamTemplate = tar.pack(path.join(__dirname, 'fixtures', 'template-project'));

// options base
const optionsBase = {
  method: 'POST',
  url: '/deploy',
  headers: {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/octet-stream',
  },
};

// storage vars
let fastify;
let simpleHtmlInitialDeploy = '';
let composeDeployOne = '';
let composeDeployTwo = '';

// set timeout to 60s
jest.setTimeout(60000);

beforeAll(async done => {
  // start new instance of fastify
  const port = await getPort();
  fastify = await startServer(port);
  // init docker network
  await initNetwork();

  done();
});

afterAll(() => fastify.close());

test('Should deploy simple docker project', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamDocker,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(1);
  expect(completeDeployments[0].Name.startsWith('/exo-admin-test-docker-deploy-')).toBeTruthy();

  // check docker services
  const allContainers = await docker.listContainers();
  const containerInfo = allContainers.find(c => c.Names.includes(completeDeployments[0].Name));
  const name = completeDeployments[0].Name.slice(1);

  expect(containerInfo).toBeDefined();
  expect(containerInfo.Labels['exoframe.deployment']).toEqual(name);
  expect(containerInfo.Labels['exoframe.user']).toEqual('admin');
  expect(containerInfo.Labels['exoframe.project']).toEqual('test-project');
  expect(containerInfo.Labels['traefik.backend']).toEqual(`${name}.test`);
  expect(containerInfo.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(containerInfo.Labels['traefik.enable']).toEqual('true');
  expect(containerInfo.NetworkSettings.Networks.exoframe).toBeDefined();

  const containerData = docker.getContainer(containerInfo.Id);
  const container = await containerData.inspect();
  // console.log(JSON.stringify(container));
  expect(container.NetworkSettings.Networks.exoframe.Aliases.includes('test')).toBeTruthy();
  expect(container.HostConfig.RestartPolicy).toMatchObject({Name: 'no', MaximumRetryCount: 0});

  // cleanup
  const instance = docker.getContainer(containerInfo.Id);
  await instance.remove({force: true});

  done();
});

test('Should deploy simple node project', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamNode,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(1);
  expect(completeDeployments[0].Name.startsWith('/exo-admin-test-node-deploy-')).toBeTruthy();

  // check docker services
  const allContainers = await docker.listContainers();
  const container = allContainers.find(c => c.Names.includes(completeDeployments[0].Name));
  const name = completeDeployments[0].Name.slice(1);
  const deployId = name
    .split('-')
    .slice(-1)
    .shift();

  expect(container).toBeDefined();
  expect(container.Labels['exoframe.deployment']).toEqual(name);
  expect(container.Labels['exoframe.user']).toEqual('admin');
  expect(container.Labels['exoframe.project']).toEqual(name.replace(`-${deployId}`, ''));
  expect(container.Labels['traefik.backend']).toEqual('localhost');
  expect(container.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(container.Labels['traefik.enable']).toEqual('true');
  expect(container.Labels['traefik.frontend.rule']).toEqual('Host:localhost');
  expect(container.NetworkSettings.Networks.exoframe).toBeDefined();

  // cleanup
  const instance = docker.getContainer(container.Id);
  await instance.remove({force: true});

  done();
});

test('Should deploy simple HTML project', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamHtml,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(1);
  const name = completeDeployments[0].Name.slice(1);
  expect(name.startsWith('exo-admin-test-html-deploy-')).toBeTruthy();

  // check docker services
  const allContainers = await docker.listContainers();
  const container = allContainers.find(c => c.Names.includes(`/${name}`));

  expect(container).toBeDefined();
  expect(container.Labels['exoframe.deployment']).toEqual(name);
  expect(container.Labels['exoframe.user']).toEqual('admin');
  expect(container.Labels['exoframe.project']).toEqual('simple-html');
  expect(container.Labels['traefik.backend']).toEqual(name);
  expect(container.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(container.Labels['traefik.enable']).toEqual('true');
  expect(container.Labels['traefik.frontend.rule']).toBeUndefined();
  expect(container.NetworkSettings.Networks.exoframe).toBeDefined();

  // store initial deploy id
  simpleHtmlInitialDeploy = container.Id;

  done();
});

test('Should update simple HTML project', async done => {
  const options = Object.assign(optionsBase, {
    url: '/update',
    payload: streamHtmlUpdate,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(1);
  const name = completeDeployments[0].Name.slice(1);
  expect(name.startsWith('exo-admin-test-html-deploy-')).toBeTruthy();

  // check docker services
  const allContainers = await docker.listContainers();
  const container = allContainers.find(c => c.Names.includes(`/${name}`));

  expect(container).toBeDefined();
  expect(container.Labels['exoframe.deployment']).toEqual(name);
  expect(container.Labels['exoframe.user']).toEqual('admin');
  expect(container.Labels['exoframe.project']).toEqual('simple-html');
  expect(container.Labels['traefik.backend']).toEqual(name);
  expect(container.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(container.Labels['traefik.enable']).toEqual('true');
  expect(container.Labels['traefik.frontend.rule']).toBeUndefined();
  expect(container.NetworkSettings.Networks.exoframe).toBeDefined();

  // get old container
  try {
    const oldInstance = docker.getContainer(simpleHtmlInitialDeploy);
    await oldInstance.inspect();
  } catch (e) {
    expect(e.toString().includes('no such container')).toBeTruthy();
  }

  // cleanup
  const instance = docker.getContainer(container.Id);
  await instance.remove({force: true});

  done();
});

test('Should deploy simple compose project', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamCompose,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(2);
  expect(completeDeployments[0].Name.startsWith('/exo-admin-test-compose-deploy-web-')).toBeTruthy();
  expect(completeDeployments[1].Name.startsWith('/exo-admin-test-compose-deploy-redis-')).toBeTruthy();

  // check docker services
  const allContainers = await docker.listContainers();
  const containerOne = allContainers.find(c => c.Names.includes(completeDeployments[0].Name));
  const containerTwo = allContainers.find(c => c.Names.includes(completeDeployments[1].Name));
  const nameOne = completeDeployments[0].Name.slice(1);
  const nameTwo = completeDeployments[1].Name.slice(1);
  const deployIdOne = nameOne
    .split('-')
    .slice(-1)
    .shift();
  const deployIdTwo = nameTwo
    .split('-')
    .slice(-1)
    .shift();

  expect(containerOne).toBeDefined();
  expect(containerTwo).toBeDefined();
  expect(containerOne.Labels['exoframe.deployment']).toEqual(nameOne);
  expect(containerTwo.Labels['exoframe.deployment']).toEqual(nameTwo);
  expect(containerOne.Labels['exoframe.user']).toEqual('admin');
  expect(containerTwo.Labels['exoframe.user']).toEqual('admin');
  expect(containerOne.Labels['exoframe.project']).toEqual(nameOne.replace(`-web-${deployIdOne}`, ''));
  expect(containerTwo.Labels['exoframe.project']).toEqual(nameTwo.replace(`-redis-${deployIdTwo}`, ''));
  expect(containerOne.Labels['traefik.backend']).toEqual(nameOne.replace(`-${deployIdOne}`, ''));
  expect(containerTwo.Labels['traefik.backend']).toEqual(nameTwo.replace(`-${deployIdTwo}`, ''));
  expect(containerOne.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(containerTwo.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(containerOne.Labels['traefik.enable']).toEqual('true');
  expect(containerTwo.Labels['traefik.enable']).toEqual('true');
  expect(containerOne.Labels['traefik.frontend.rule']).toEqual('Host:test.dev');
  expect(containerOne.NetworkSettings.Networks.exoframe).toBeDefined();
  expect(containerTwo.NetworkSettings.Networks.exoframe).toBeDefined();

  // store ids for update test
  composeDeployOne = containerOne.Id;
  composeDeployTwo = containerTwo.Id;

  done();
});

test('Should update simple compose project', async done => {
  const options = Object.assign(optionsBase, {
    url: '/update',
    payload: streamComposeUpdate,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(2);
  expect(completeDeployments[0].Name.startsWith('/exo-admin-test-compose-deploy-web-')).toBeTruthy();
  expect(completeDeployments[1].Name.startsWith('/exo-admin-test-compose-deploy-redis-')).toBeTruthy();

  // check docker services
  const allContainers = await docker.listContainers();
  const containerOne = allContainers.find(c => c.Names.includes(completeDeployments[0].Name));
  const containerTwo = allContainers.find(c => c.Names.includes(completeDeployments[1].Name));
  const nameOne = completeDeployments[0].Name.slice(1);
  const nameTwo = completeDeployments[1].Name.slice(1);
  const deployIdOne = nameOne
    .split('-')
    .slice(-1)
    .shift();
  const deployIdTwo = nameTwo
    .split('-')
    .slice(-1)
    .shift();

  expect(containerOne).toBeDefined();
  expect(containerTwo).toBeDefined();
  expect(containerOne.Labels['exoframe.deployment']).toEqual(nameOne);
  expect(containerTwo.Labels['exoframe.deployment']).toEqual(nameTwo);
  expect(containerOne.Labels['exoframe.user']).toEqual('admin');
  expect(containerTwo.Labels['exoframe.user']).toEqual('admin');
  expect(containerOne.Labels['exoframe.project']).toEqual(nameOne.replace(`-web-${deployIdOne}`, ''));
  expect(containerTwo.Labels['exoframe.project']).toEqual(nameTwo.replace(`-redis-${deployIdTwo}`, ''));
  expect(containerOne.Labels['traefik.backend']).toEqual(nameOne.replace(`-${deployIdOne}`, ''));
  expect(containerTwo.Labels['traefik.backend']).toEqual(nameTwo.replace(`-${deployIdTwo}`, ''));
  expect(containerOne.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(containerTwo.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(containerOne.Labels['traefik.enable']).toEqual('true');
  expect(containerTwo.Labels['traefik.enable']).toEqual('true');
  expect(containerOne.Labels['traefik.frontend.rule']).toEqual('Host:test.dev');
  expect(containerOne.NetworkSettings.Networks.exoframe).toBeDefined();
  expect(containerTwo.NetworkSettings.Networks.exoframe).toBeDefined();

  // get old containers
  try {
    const oldInstance = docker.getContainer(composeDeployOne);
    await oldInstance.inspect();
  } catch (e) {
    expect(e.toString().includes('no such container')).toBeTruthy();
  }
  try {
    const oldInstance = docker.getContainer(composeDeployTwo);
    await oldInstance.inspect();
  } catch (e) {
    expect(e.toString().includes('no such container')).toBeTruthy();
  }

  // cleanup
  const instanceOne = docker.getContainer(containerOne.Id);
  await instanceOne.remove({force: true});
  const instanceTwo = docker.getContainer(containerTwo.Id);
  await instanceTwo.remove({force: true});

  done();
});

test('Should display error log for broken docker project', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamBrokenDocker,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // get last error
  const error = result.pop();

  // check response
  expect(response.statusCode).toEqual(200);
  expect(error.message).toEqual('Build failed! See build log for details.');
  expect(error.log[0].includes('Step 1/3 : FROM busybox')).toBeTruthy();
  expect(error.log.find(l => l.includes('Step 2/3 : RUN exit 1'))).toBeDefined();
  expect(error.log[error.log.length - 1]).toEqual("The command '/bin/sh -c exit 1' returned a non-zero code: 1");

  // clean all exited containers
  const allContainers = await docker.listContainers({all: true});
  const exitedWithError = allContainers.filter(c => c.Status.includes('Exited (1)'));
  await Promise.all(exitedWithError.map(c => docker.getContainer(c.Id)).map(c => c.remove()));

  done();
});

test('Should display error log for broken Node.js project', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamBrokenNode,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // get last error
  const error = result.pop();

  // check response
  expect(response.statusCode).toEqual(200);
  expect(error.message).toEqual('Build failed! See build log for details.');
  expect(error.log[0].includes('Step 1/8 : FROM node:latest')).toBeTruthy();
  expect(error.log.find(l => l.includes('Step 2/8 : RUN mkdir -p /usr/src/app'))).toBeDefined();
  expect(error.log[error.log.length - 1]).toEqual(
    "The command '/bin/sh -c npm install --silent' returned a non-zero code: 1"
  );

  // clean all exited containers
  const allContainers = await docker.listContainers({all: true});
  const exitedWithError = allContainers.filter(c => c.Status.includes('Exited (1)'));
  await Promise.all(exitedWithError.map(c => docker.getContainer(c.Id)).map(c => c.remove()));

  done();
});

test('Should have additional labels', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamAdditionalLabels,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);

  // check docker services
  const allContainers = await docker.listContainers();
  const containerInfo = allContainers.find(c => c.Names.includes(completeDeployments[0].Name));
  expect(containerInfo).toBeDefined();
  expect(containerInfo.Labels['custom.label']).toEqual('additional-label');

  // cleanup
  const instance = docker.getContainer(containerInfo.Id);
  await instance.remove({force: true});

  done();
});

test('Should deploy project with configured template', async done => {
  const options = Object.assign(optionsBase, {
    payload: streamTemplate,
  });

  const response = await fastify.inject(options);
  // parse result into lines
  const result = response.payload
    .split('\n')
    .filter(l => l && l.length)
    .map(line => JSON.parse(line));

  // find deployments
  const completeDeployments = result.find(it => it.deployments && it.deployments.length).deployments;

  // check response
  expect(response.statusCode).toEqual(200);
  expect(completeDeployments.length).toEqual(1);
  expect(result[0]).toEqual({message: 'Deploying Static HTML project..', level: 'info'});

  // check docker services
  const allContainers = await docker.listContainers();
  const container = allContainers.find(c => c.Names.includes(completeDeployments[0].Name));
  const name = completeDeployments[0].Name.slice(1);
  expect(name.startsWith('exo-admin-test-static-deploy-')).toBeTruthy();
  const deployId = name
    .split('-')
    .slice(-1)
    .shift();

  expect(container).toBeDefined();
  expect(container.Labels['exoframe.deployment']).toEqual(name);
  expect(container.Labels['exoframe.user']).toEqual('admin');
  expect(container.Labels['exoframe.project']).toEqual(name.replace(`-${deployId}`, ''));
  expect(container.Labels['traefik.backend']).toEqual('localhost');
  expect(container.Labels['traefik.docker.network']).toEqual('exoframe');
  expect(container.Labels['traefik.enable']).toEqual('true');
  expect(container.Labels['traefik.frontend.rule']).toEqual('Host:localhost');
  expect(container.NetworkSettings.Networks.exoframe).toBeDefined();

  // cleanup
  const instance = docker.getContainer(container.Id);
  await instance.remove({force: true});

  done();
});
