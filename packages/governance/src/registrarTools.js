// @ts-check

import { E } from '@agoric/eventual-send';
import { allComparable } from '@agoric/same-structure';
import { Far } from '@agoric/marshal';

const startCounter = async (
  zcf,
  ballotSpec,
  quorumThreshold,
  voteCounter,
  questionStore,
  updater,
) => {
  const ballotCounterTerms = {
    ballotSpec,
    registrar: zcf.getInstance(),
    quorumThreshold,
  };

  // facets of the ballot counter. creatorInvitation and adminFacet not used
  const { creatorFacet, publicFacet, instance } = await E(
    zcf.getZoeService(),
  ).startInstance(voteCounter, {}, ballotCounterTerms);
  const details = await E(publicFacet).getDetails();
  const { deadline } = ballotSpec.closingRule;
  updater.updateState(details);
  const handle = details.handle;
  const facets = {
    voter: E(creatorFacet).getVoterFacet(),
    publicFacet,
    deadline,
  };
  questionStore.init(handle, facets);

  return { creatorFacet, publicFacet, instance, deadline, handle };
};

const getOpenQuestions = async questionStore => {
  const isOpenPQuestions = questionStore.keys().map(key => {
    const { publicFacet } = questionStore.get(key);
    return [E(publicFacet).isOpen(), key];
  });

  const isOpenQuestions = await allComparable(harden(isOpenPQuestions));
  return isOpenQuestions
    .filter(([open, _key]) => open)
    .map(([_open, key]) => key);
};

const getBallot = (handleP, questionStore) =>
  E.when(handleP, handle =>
    E(questionStore.get(handle).publicFacet).getBallotTemplate(),
  );

const getPoserInvitation = (zcf, addQuestion) => {
  const questionPoserHandler = () => Far(`questionPoser`, { addQuestion });
  return zcf.makeInvitation(questionPoserHandler, `questionPoser`);
};

harden(startCounter);
harden(getOpenQuestions);
harden(getBallot);
harden(getPoserInvitation);

export { startCounter, getOpenQuestions, getBallot, getPoserInvitation };
