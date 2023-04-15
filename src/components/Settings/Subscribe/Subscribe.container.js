import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import Subscribe from './Subscribe.component';
import { getUser, isLogged } from '../../App/App.selectors';
import API from '../../../api';

import { isAndroid } from '../../../cordova-util';
import {
  checkSubscription,
  updateSubscriberId,
  updateSubscription,
  updateSubscriptionError,
  updateIsSubscribed,
  updatePlans
} from '../../../providers/SubscriptionProvider/SubscriptionProvider.actions';
import {
  NOT_SUBSCRIBED,
  PROCCESING,
  EXPIRED,
  ACTIVE
} from '../../../providers/SubscriptionProvider/SubscriptionProvider.constants';

import { formatTitle } from './Subscribe.helpers';

export class SubscribeContainer extends PureComponent {
  static propTypes = {
    history: PropTypes.object.isRequired,
    subscription: PropTypes.object.isRequired
  };

  componentDidMount() {
    const { updateIsSubscribed, updatePlans } = this.props;
    updateIsSubscribed();
    updatePlans();
  }

  handleChange = name => event => {
    this.setState({
      ...this.state,
      [name]: event.target.value
    });
  };

  handleRefreshSubscription = () => {
    const { updateIsSubscribed, updatePlans } = this.props;
    window.CdvPurchase.store.restorePurchases();
    updateIsSubscribed();
    updatePlans();
  };

  handleError = e => {
    const { updateSubscriptionError, updateSubscription } = this.props;

    updateSubscriptionError({
      showError: true,
      message: e.message,
      code: e.code
    });

    updateSubscription({
      isSubscribed: false,
      expiryDate: null,
      androidSubscriptionState: NOT_SUBSCRIBED
    });

    setTimeout(() => {
      updateSubscriptionError({
        showError: false,
        message: '',
        code: ''
      });
    }, 3000);
  };

  handleSubscribe = product => async event => {
    const {
      user,
      isLogged,
      location,
      updateSubscriberId,
      updateSubscription,
      subscription
    } = this.props;
    if (isAndroid()) {
      if (
        (isLogged &&
          product &&
          subscription.androidSubscriptionState === NOT_SUBSCRIBED) ||
        subscription.androidSubscriptionState === EXPIRED
      ) {
        const newProduct = {
          title: formatTitle(product.title),
          billingPeriod: product.billingPeriod,
          price: product.price,
          tag: product.tag,
          subscriptionId: product.subscriptionId
        };
        const apiProduct = {
          product: {
            ...newProduct
          }
        };
        console.log('enytro 1');

        updateSubscription({
          isSubscribed: false,
          expiryDate: null,
          androidSubscriptionState: PROCCESING,
          ownedProduct: ''
        });

        // get offer from the plugin
        let offers, offer;
        try {
          await window.CdvPurchase.store.update();
          offers = await window.CdvPurchase.store.products[0].offers;
          offer = offers.find(offer => offer.tags[0] === product.tag);
        } catch (err) {
          console.error('Cannot subscribe product. Error: ', err.message);
          this.handleError(err);
        }

        try {
          // update the api
          const subscriber = await API.getSubscriber(user.id);
          updateSubscriberId(subscriber._id);
          await API.updateSubscriber(apiProduct);

          // proceed with the purchase
          const order = await window.CdvPurchase.store.order(offer);
          console.log(order);
          if (order && order.isError) throw order;
          console.log('enytro 2');
          updateSubscription({
            ownedProduct: product,
            androidSubscriptionState: ACTIVE,
            isInFreeCountry: false,
            isOnTrialPeriod: false,
            isSubscribed: true
          });
        } catch (err) {
          if (err.response?.data.error === 'subscriber not found') {
            try {
              const newSubscriber = {
                userId: user.id,
                country: location.countryCode || 'Not localized',
                status: NOT_SUBSCRIBED,
                ...apiProduct
              };
              const res = await API.createSubscriber(newSubscriber);
              updateSubscriberId(res._id);
              const order = await window.CdvPurchase.store.order(offer);
              if (order && order.isError) throw order;
              console.log('enytro 3');
              updateSubscription({
                ownedProduct: product,
                androidSubscriptionState: ACTIVE,
                isInFreeCountry: false,
                isOnTrialPeriod: false,
                isSubscribed: true
              });
            } catch (err) {
              console.error('Cannot subscribe product. Error: ', err.message);
              this.handleError(err);
            }
            return;
          }
          console.error('Cannot subscribe product. Error: ', err.message);
          this.handleError(err);
        }
      }
    }
  };

  render() {
    const { history, location } = this.props;

    return (
      <Subscribe
        onClose={history.goBack}
        isLogged={this.props.isLogged}
        onSubscribe={this.handleSubscribe}
        location={location}
        subscription={this.props.subscription}
        updateSubscriberId={this.props.updateSubscriberId}
        onRefreshSubscription={this.handleRefreshSubscription}
      />
    );
  }
}

const mapStateToProps = state => {
  const userIsLogged = isLogged(state);
  const user = getUser(state);
  const location = userIsLogged
    ? {
        country: user?.location?.country,
        countryCode: user?.location?.countryCode
      }
    : {
        country: state.app.unloggedUserLocation?.country,
        countryCode: state.app.unloggedUserLocation?.countryCode
      };
  return {
    isLogged: userIsLogged,
    user: user,
    location: location,
    subscription: state.subscription
  };
};

const mapDispatchToProps = {
  updateSubscriberId,
  updateSubscription,
  checkSubscription: checkSubscription,
  updateSubscriptionError,
  updateIsSubscribed,
  updatePlans
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(SubscribeContainer);
